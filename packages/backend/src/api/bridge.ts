// Bridge API Routes
// Provides 3 tool-calling endpoints for OpenClaw agents to interact with workflows

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { bridgeAuth, type AuthenticatedRequest } from './bridge-auth.js';
import { executeWorkflowSync, getExecutionResult } from '../services/sync-executor.js';
import crypto from 'crypto';
import type {
  CatalogEntry,
  BridgeRunRequest,
  BridgeRunResponse,
  BridgeStatusResponse,
  HITLRequest,
} from '@garage-engine/shared';

export const bridgeRouter: RouterType = Router();

// All bridge routes require authentication
bridgeRouter.use(bridgeAuth);

// In-memory deduplication cache (job_id -> execution result)
// Maps hash(case_id + domain_id + tool_name + inputs) -> { executionId, timestamp }
const deduplicationCache = new Map<string, { executionId: string; timestamp: number }>();
const DEDUP_TTL_MS = 3600_000; // 1 hour

function computeDeduplicationKey(
  caseId: string,
  domainId: string,
  toolName: string,
  inputs: Record<string, unknown>,
): string {
  const payload = JSON.stringify({ caseId, domainId, toolName, inputs });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function cleanupDeduplicationCache(): void {
  const now = Date.now();
  for (const [key, value] of deduplicationCache) {
    if (now - value.timestamp > DEDUP_TTL_MS) {
      deduplicationCache.delete(key);
    }
  }
}

// Cleanup stale entries every 10 minutes
setInterval(cleanupDeduplicationCache, 600_000);

/**
 * POST /api/bridge/catalog
 * Returns all enabled scenarios (tools) for a given domain
 */
bridgeRouter.post('/catalog', async (req: AuthenticatedRequest, res) => {
  try {
    const { domain_id } = req.body as { domain_id: string };

    if (!domain_id) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'domain_id is required' },
      });
    }

    // Verify domain exists
    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, domain_id))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    // Get all enabled scenarios for this domain
    const scenarios = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domain_id),
          eq(schema.scenarios.enabled, true),
        ),
      );

    const catalog: CatalogEntry[] = scenarios.map((s) => ({
      toolName: s.toolName,
      name: s.name,
      shortDescription: s.shortDescription,
      whenToApply: s.whenToApply,
      inputsSchema: s.inputsSchema as Record<string, unknown> | undefined,
      outputsSchema: s.outputsSchema as Record<string, unknown> | undefined,
      riskClass: s.riskClass as CatalogEntry['riskClass'],
      estimatedDuration: s.estimatedDuration as CatalogEntry['estimatedDuration'],
    }));

    res.json({ tools: catalog });
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch catalog' },
    });
  }
});

/**
 * POST /api/bridge/run
 * Execute a scenario (tool) by domain_id + tool_name
 * Supports idempotency via hash(case_id + domain_id + tool_name + inputs)
 */
bridgeRouter.post('/run', async (req: AuthenticatedRequest, res) => {
  try {
    const { domain_id, tool_name, inputs, case_id } = req.body as BridgeRunRequest;

    // Validate required fields
    if (!domain_id || !tool_name || !case_id) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'domain_id, tool_name, and case_id are required',
        },
      });
    }

    // Check deduplication cache
    const dedupKey = computeDeduplicationKey(case_id, domain_id, tool_name, inputs || {});
    const cachedResult = deduplicationCache.get(dedupKey);

    if (cachedResult) {
      // Return cached execution result
      const existingResult = await getExecutionResult(cachedResult.executionId);
      if (existingResult) {
        const response: BridgeRunResponse = {
          job_id: existingResult.executionId,
          status: existingResult.status as BridgeRunResponse['status'],
          outputs: existingResult.outputs,
          error: existingResult.error,
          hitl_request_id: existingResult.hitlRequestId,
        };
        return res.json(response);
      }
    }

    // Find scenario by (domain_id, tool_name) - UNIQUE constraint ensures at most one
    const scenario = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domain_id),
          eq(schema.scenarios.toolName, tool_name),
        ),
      )
      .get();

    if (!scenario) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Tool '${tool_name}' not found in domain '${domain_id}'`,
        },
      });
    }

    if (!scenario.enabled) {
      return res.status(400).json({
        error: {
          code: 'TOOL_DISABLED',
          message: `Tool '${tool_name}' is currently disabled`,
        },
      });
    }

    // Verify case exists
    const caseRecord = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, case_id))
      .get();

    if (!caseRecord) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
    }

    // Get next step index for this case
    const existingSteps = await db
      .select()
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, case_id));
    const nextStepIndex = existingSteps.length;

    // Log tool_call step
    await db.insert(schema.caseSteps).values({
      caseId: case_id,
      stepIndex: nextStepIndex,
      type: 'tool_call',
      content: JSON.stringify({
        toolName: tool_name,
        inputs: inputs || {},
        scenarioId: scenario.id,
      }),
      scenarioId: scenario.id,
    });

    // Execute workflow synchronously
    const result = await executeWorkflowSync(
      scenario.workflowId,
      'manual',
      { bridgeInputs: inputs || {}, caseId: case_id, scenarioId: scenario.id },
    );

    // Cache the result for deduplication
    deduplicationCache.set(dedupKey, {
      executionId: result.executionId,
      timestamp: Date.now(),
    });

    // Log tool_result step
    await db.insert(schema.caseSteps).values({
      caseId: case_id,
      stepIndex: nextStepIndex + 1,
      type: result.status === 'waiting_hitl' ? 'hitl_request' : 'tool_result',
      content: JSON.stringify({
        executionId: result.executionId,
        status: result.status,
        outputs: result.outputs,
        error: result.error,
        hitlRequestId: result.hitlRequestId,
      }),
      executionId: result.executionId,
      scenarioId: scenario.id,
    });

    const response: BridgeRunResponse = {
      job_id: result.executionId,
      status: result.status as BridgeRunResponse['status'],
      outputs: result.outputs,
      error: result.error,
      hitl_request_id: result.hitlRequestId,
    };

    res.json(response);
  } catch (error) {
    console.error('Error running tool:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to run tool' },
    });
  }
});

/**
 * POST /api/bridge/status
 * Get status of a running/completed job, including HITL request details
 */
bridgeRouter.post('/status', async (req: AuthenticatedRequest, res) => {
  try {
    const { job_id } = req.body as { job_id: string };

    if (!job_id) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'job_id is required' },
      });
    }

    // Get execution
    const execution = await db
      .select()
      .from(schema.executions)
      .where(eq(schema.executions.id, job_id))
      .get();

    if (!execution) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Job not found' },
      });
    }

    const response: BridgeStatusResponse = {
      job_id: execution.id,
      status: execution.status as BridgeStatusResponse['status'],
      error: execution.error ?? undefined,
    };

    // If waiting for HITL, include request details
    if (execution.status === 'waiting_hitl') {
      const hitlRequest = await db
        .select()
        .from(schema.hitlRequests)
        .where(
          and(
            eq(schema.hitlRequests.executionId, job_id),
            eq(schema.hitlRequests.status, 'pending'),
          ),
        )
        .get();

      if (hitlRequest) {
        const requestData = hitlRequest.requestData as HITLRequest;
        response.hitl_request = {
          id: hitlRequest.id,
          type: hitlRequest.type as HITLRequest['type'],
          message: requestData.message,
          details: requestData.details,
          fields: requestData.fields,
          options: requestData.options,
        };
      }
    }

    // If completed, try to get outputs from execution nodes
    if (execution.status === 'completed') {
      const nodes = await db
        .select()
        .from(schema.executionNodes)
        .where(eq(schema.executionNodes.executionId, job_id));

      // Find the last completed node with output data
      const outputNode = nodes
        .filter((n) => n.status === 'completed' && n.outputData)
        .pop();

      if (outputNode?.outputData) {
        response.outputs = outputNode.outputData as Record<string, unknown>;
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch status' },
    });
  }
});
