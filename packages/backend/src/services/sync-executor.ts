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

interface ExecutionCompletedEvent {
  executionId: string;
  status: ExecutionStatus;
  outputs?: Record<string, unknown>;
  error?: string;
}

interface HITLRequiredEvent {
  executionId: string;
  requestId: string;
}

/**
 * Execute a workflow synchronously (blocking until completion or HITL)
 * Returns when execution completes, fails, or requires HITL intervention
 */
export async function executeWorkflowSync(
  workflowId: string,
  triggerType: TriggerType,
  triggerData: unknown,
  timeoutMs: number = SYNC_TIMEOUT_MS,
): Promise<SyncExecuteResult> {
  const startTime = Date.now();
  const executionService = getExecutionService();

  // Start execution (fire-and-forget internally)
  const { executionId } = await executionService.executeWorkflow(
    workflowId,
    triggerType,
    triggerData,
  );

  // Wait for completion, failure, or HITL
  return new Promise<SyncExecuteResult>((resolve) => {
    let resolved = false;

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      executionEventBus.off('execution:completed', onCompleted);
      executionEventBus.off('execution:failed', onFailed);
      executionEventBus.off('hitl:required', onHitlRequired);
      clearTimeout(timeoutHandle);
    };

    const onCompleted = (event: ExecutionCompletedEvent) => {
      if (event.executionId !== executionId) return;
      cleanup();
      resolve({
        executionId,
        status: 'completed',
        outputs: event.outputs,
        durationMs: Date.now() - startTime,
      });
    };

    const onFailed = (event: ExecutionCompletedEvent) => {
      if (event.executionId !== executionId) return;
      cleanup();
      resolve({
        executionId,
        status: 'failed',
        error: event.error,
        durationMs: Date.now() - startTime,
      });
    };

    const onHitlRequired = (event: HITLRequiredEvent) => {
      if (event.executionId !== executionId) return;
      cleanup();
      resolve({
        executionId,
        status: 'waiting_hitl',
        hitlRequestId: event.requestId,
        durationMs: Date.now() - startTime,
      });
    };

    executionEventBus.on('execution:completed', onCompleted);
    executionEventBus.on('execution:failed', onFailed);
    executionEventBus.on('hitl:required', onHitlRequired);

    // Timeout fallback - check DB for status
    const timeoutHandle = setTimeout(async () => {
      if (resolved) return;

      // Check current status from DB
      const execution = await db
        .select()
        .from(schema.executions)
        .where(eq(schema.executions.id, executionId))
        .get();

      cleanup();

      if (!execution) {
        resolve({
          executionId,
          status: 'failed',
          error: 'Execution not found',
          durationMs: Date.now() - startTime,
        });
        return;
      }

      resolve({
        executionId,
        status: execution.status as ExecutionStatus,
        error: execution.error ?? undefined,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);
  });
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
