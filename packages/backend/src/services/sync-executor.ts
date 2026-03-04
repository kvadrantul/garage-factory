// Sync Executor Service
// Wraps fire-and-forget workflow execution into blocking Promise-based calls

import { EventEmitter } from 'events';
import { getExecutionService } from './execution-service.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import type { ExecutionStatus, SyncExecuteResult, TriggerType } from '@garage-engine/shared';

const SYNC_TIMEOUT_MS = 300_000; // 5 minutes max for sync execution

// Global event bus for execution events (populated by broadcast in index.ts)
export const executionEventBus = new EventEmitter();
executionEventBus.setMaxListeners(100);

/**
 * Fetch outputs from the last completed node of an execution
 */
async function fetchExecutionOutputs(executionId: string): Promise<Record<string, unknown> | undefined> {
  try {
    const nodes = await db
      .select()
      .from(schema.executionNodes)
      .where(eq(schema.executionNodes.executionId, executionId));
    const outputNode = nodes
      .filter((n) => n.status === 'completed' && n.outputData)
      .pop();
    if (outputNode?.outputData) {
      return outputNode.outputData as Record<string, unknown>;
    }
  } catch (err) {
    console.error(`[sync-executor] Error fetching execution nodes:`, err);
  }
  return undefined;
}

/**
 * Execute a workflow synchronously (blocking until completion or HITL)
 * Returns when execution completes, fails, or requires HITL intervention.
 *
 * Uses the completionPromise from ExecutionService directly to avoid
 * race conditions with event-based notification.
 */
export async function executeWorkflowSync(
  workflowId: string,
  triggerType: TriggerType,
  triggerData: unknown,
  timeoutMs: number = SYNC_TIMEOUT_MS,
): Promise<SyncExecuteResult> {
  const startTime = Date.now();
  const executionService = getExecutionService();

  // Start execution - completionPromise resolves when runner.execute() finishes
  const { executionId, completionPromise } = await executionService.executeWorkflow(
    workflowId,
    triggerType,
    triggerData,
  );

  // Race: completion vs timeout
  const timeoutPromise = new Promise<{ status: 'timeout' }>((resolve) => {
    setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });

  const result = await Promise.race([
    completionPromise.then((r) => ({ ...r, status: r.status as string })),
    timeoutPromise,
  ]);

  if (result.status === 'timeout') {
    // Check DB for actual status
    const execution = await db
      .select()
      .from(schema.executions)
      .where(eq(schema.executions.id, executionId))
      .get();

    return {
      executionId,
      status: (execution?.status ?? 'failed') as ExecutionStatus,
      error: execution?.error ?? 'Execution timed out',
      durationMs: Date.now() - startTime,
    };
  }

  const durationMs = Date.now() - startTime;

  if (result.status === 'completed') {
    const outputs = await fetchExecutionOutputs(executionId);
    return { executionId, status: 'completed', outputs, durationMs };
  }

  if (result.status === 'failed') {
    return {
      executionId,
      status: 'failed',
      error: (result as { error?: string }).error,
      durationMs,
    };
  }

  // For waiting_hitl or other statuses, check for HITL request
  if (result.status === 'waiting_hitl') {
    const hitlRequest = await db
      .select()
      .from(schema.hitlRequests)
      .where(eq(schema.hitlRequests.executionId, executionId))
      .get();

    return {
      executionId,
      status: 'waiting_hitl',
      hitlRequestId: hitlRequest?.id,
      durationMs,
    };
  }

  return { executionId, status: result.status as ExecutionStatus, durationMs };
}

/**
 * Get execution result with HITL request details if waiting
 */
export async function getExecutionResult(executionId: string): Promise<SyncExecuteResult | null> {
  const execution = await db
    .select()
    .from(schema.executions)
    .where(eq(schema.executions.id, executionId))
    .get();

  if (!execution) return null;

  const result: SyncExecuteResult = {
    executionId,
    status: execution.status as ExecutionStatus,
    error: execution.error ?? undefined,
    durationMs: execution.finishedAt && execution.startedAt
      ? new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()
      : 0,
  };

  // If waiting for HITL, get the pending request
  if (execution.status === 'waiting_hitl') {
    const hitlRequest = await db
      .select()
      .from(schema.hitlRequests)
      .where(eq(schema.hitlRequests.executionId, executionId))
      .get();

    if (hitlRequest && hitlRequest.status === 'pending') {
      result.hitlRequestId = hitlRequest.id;
    }
  }

  return result;
}
