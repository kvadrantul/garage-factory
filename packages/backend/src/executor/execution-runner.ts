import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { GraphResolver } from './graph-resolver.js';
import { StateManager } from './state-manager.js';
import { AbortedError, NodeExecutionError } from './errors.js';
import { nodeRegistry } from '../nodes/registry.js';
import { db, schema } from '../db/index.js';
import type {
  WorkflowDefinition,
  WorkflowSettings,
  TriggerType,
  NodeContext,
  NodeResult,
  NodeHelpers,
  ExecutionResult,
  HITLRequest,
  HITLResponse,
} from '@garage-engine/shared';

export class ExecutionRunner extends EventEmitter {
  private graphResolver: GraphResolver;
  private stateManager: StateManager;
  private abortController: AbortController;
  private errorHandling: 'stop' | 'continue';
  private retryOnFail: boolean;
  private maxRetries: number;
  private hasNodeErrors = false;

  constructor(
    private workflowId: string,
    private definition: WorkflowDefinition,
    private triggerType: TriggerType,
    private triggerData: unknown,
    settings?: WorkflowSettings,
  ) {
    super();
    this.graphResolver = new GraphResolver(definition);
    this.stateManager = new StateManager();
    this.abortController = new AbortController();
    this.errorHandling = settings?.errorHandling || 'stop';
    this.retryOnFail = settings?.retryOnFail ?? false;
    this.maxRetries = settings?.maxRetries ?? 1;
  }

  async execute(): Promise<ExecutionResult> {
    const now = new Date();
    const execution = await db
      .insert(schema.executions)
      .values({
        workflowId: this.workflowId,
        status: 'running',
        triggerType: this.triggerType,
        triggerData: this.triggerData,
        startedAt: now,
        createdAt: now,
      })
      .returning()
      .get();

    this.emit('execution:started', { executionId: execution.id });

    try {
      const startNodes = this.graphResolver.getStartNodes();

      for (const nodeId of startNodes) {
        if (this.abortController.signal.aborted) {
          throw new AbortedError(execution.id);
        }
        await this.executeNode(execution.id, nodeId, this.triggerData);
      }

      // If continue mode and some nodes had errors, mark as completed with warning
      const finalStatus = this.hasNodeErrors ? 'completed' : 'completed';
      await db
        .update(schema.executions)
        .set({ status: finalStatus, finishedAt: new Date() })
        .where(eq(schema.executions.id, execution.id));

      this.emit('execution:completed', { executionId: execution.id });
      return { executionId: execution.id, status: 'completed' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(schema.executions)
        .set({ status: 'failed', error: message, finishedAt: new Date() })
        .where(eq(schema.executions.id, execution.id));

      this.emit('execution:failed', { executionId: execution.id, error: message });
      return { executionId: execution.id, status: 'failed', error: message };
    }
  }

  private async executeNode(
    executionId: string,
    nodeId: string,
    inputData: unknown,
  ): Promise<void> {
    if (this.abortController.signal.aborted) {
      throw new AbortedError(executionId);
    }

    const node = this.definition.nodes.find((n) => n.id === nodeId);
    if (!node) throw new NodeExecutionError(`Node ${nodeId} not found`, nodeId, 'unknown', executionId);

    const runner = nodeRegistry[node.type];
    if (!runner) throw new NodeExecutionError(`No runner for node type: ${node.type}`, nodeId, node.type, executionId);

    // Create node execution record
    const nodeExec = await db
      .insert(schema.executionNodes)
      .values({
        executionId,
        nodeId,
        status: 'running',
        inputData,
        startedAt: new Date(),
      })
      .returning()
      .get();

    this.emit('execution:node:started', { executionId, nodeId, nodeType: node.type });

    // Retry logic
    const maxAttempts = this.retryOnFail ? this.maxRetries + 1 : 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const context: NodeContext = {
          node,
          inputs: { main: [inputData] },
          credentials: undefined,
          execution: { id: executionId, workflowId: this.workflowId },
          helpers: this.createHelpers(),
          emit: (event: string, data: unknown) =>
            this.emit(event, { executionId, nodeId, ...Object(data) }),
        };

        const result = await runner.execute(context);

        // Handle HITL pause
        if (result.waitForHitl) {
          await this.handleHitl(executionId, nodeId, nodeExec.id, result.waitForHitl, inputData);
          return;
        }

        // Store result
        this.stateManager.setNodeResult(nodeId, result);
        if (result.outputIndex !== undefined) {
          this.stateManager.setOutputIndex(nodeId, result.outputIndex);
        }

        await db
          .update(schema.executionNodes)
          .set({ status: 'completed', outputData: result.data, finishedAt: new Date() })
          .where(eq(schema.executionNodes.id, nodeExec.id));

        this.emit('execution:node:completed', { executionId, nodeId, output: result.data });

        // Process downstream
        await this.processDownstream(executionId, nodeId);
        return; // Success, exit retry loop
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // Log retry attempt and wait before retrying
          console.log(`Node ${nodeId} failed (attempt ${attempt}/${maxAttempts}), retrying...`);
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
      }
    }

    // All attempts failed
    const message = lastError?.message ?? 'Unknown error';
    await db
      .update(schema.executionNodes)
      .set({ status: 'error', error: message, finishedAt: new Date() })
      .where(eq(schema.executionNodes.id, nodeExec.id));

    this.emit('execution:node:error', { executionId, nodeId, error: message });

    if (this.errorHandling === 'continue') {
      // Mark that we had errors, but continue with other branches
      this.hasNodeErrors = true;
      this.stateManager.markFailed(nodeId);
      return;
    }

    // Default: stop execution
    throw lastError!;
  }

  private async processDownstream(executionId: string, nodeId: string): Promise<void> {
    const downstream = this.graphResolver.getDownstreamNodes(nodeId);

    for (const downId of downstream) {
      // Check conditional routing
      const edge = this.graphResolver.getEdge(nodeId, downId);
      const outputIndex = this.stateManager.getOutputIndex(nodeId);

      if (outputIndex !== undefined && edge?.sourceHandle) {
        const handleIndex = parseInt(edge.sourceHandle.replace('output_', ''), 10);
        if (handleIndex !== outputIndex) {
          // This branch was not taken, skip
          continue;
        }
      }

      // Check all inputs ready for merge-type nodes
      const inputs = this.graphResolver.getNodeInputs(downId);
      const allReady = inputs.every((id) => this.stateManager.isExecuted(id));

      if (!allReady) continue;

      const inputData = this.collectInputData(downId);
      await this.executeNode(executionId, downId, inputData);
    }
  }

  private collectInputData(nodeId: string): unknown {
    const inputs = this.graphResolver.getNodeInputs(nodeId);
    const results = inputs
      .map((inputId) => {
        const result = this.stateManager.getNodeResult(inputId);
        return result?.data ?? null;
      })
      .filter((d) => d !== null);

    return results.length === 1 ? results[0] : results;
  }

  private async handleHitl(
    executionId: string,
    nodeId: string,
    nodeExecId: string,
    request: HITLRequest,
    inputData: unknown,
  ): Promise<void> {
    const hitl = await db
      .insert(schema.hitlRequests)
      .values({
        executionId,
        nodeId,
        type: request.type,
        requestData: request,
        expiresAt: request.timeoutSeconds
          ? new Date(Date.now() + request.timeoutSeconds * 1000)
          : null,
        createdAt: new Date(),
      })
      .returning()
      .get();

    await db
      .update(schema.executions)
      .set({ status: 'waiting_hitl' })
      .where(eq(schema.executions.id, executionId));

    await db
      .update(schema.executionNodes)
      .set({ status: 'waiting_hitl' })
      .where(eq(schema.executionNodes.id, nodeExecId));

    this.emit('hitl:required', {
      executionId,
      hitlId: hitl.id,
      nodeId,
      type: request.type,
      requestData: request,
    });

    // Poll for response
    const response = await this.waitForHitlResponse(hitl.id, request.timeoutSeconds);

    if (response.status === 'timeout') {
      await db.update(schema.executionNodes)
        .set({ status: 'error', error: 'HITL timeout', finishedAt: new Date() })
        .where(eq(schema.executionNodes.id, nodeExecId));
      throw new Error('HITL request timed out');
    }

    if (response.status === 'rejected') {
      await db.update(schema.executionNodes)
        .set({ status: 'error', error: 'HITL rejected', finishedAt: new Date() })
        .where(eq(schema.executionNodes.id, nodeExecId));
      throw new Error('HITL request rejected');
    }

    // Resume
    const outputData = {
      ...Object(inputData),
      hitlResponse: response.responseData,
      approved: true,
    };

    this.stateManager.setNodeResult(nodeId, { data: outputData });

    await db.update(schema.executionNodes)
      .set({ status: 'completed', outputData, finishedAt: new Date() })
      .where(eq(schema.executionNodes.id, nodeExecId));

    await db.update(schema.executions)
      .set({ status: 'running' })
      .where(eq(schema.executions.id, executionId));

    this.emit('hitl:resolved', { executionId, hitlId: hitl.id, status: 'approved' });
    this.emit('execution:node:completed', { executionId, nodeId, output: outputData });

    await this.processDownstream(executionId, nodeId);
  }

  private waitForHitlResponse(
    hitlId: string,
    timeoutSeconds?: number,
  ): Promise<HITLResponse> {
    return new Promise((resolve) => {
      const deadline = timeoutSeconds ? Date.now() + timeoutSeconds * 1000 : null;

      const check = setInterval(async () => {
        const hitl = await db
          .select()
          .from(schema.hitlRequests)
          .where(eq(schema.hitlRequests.id, hitlId))
          .get();

        if (hitl && hitl.status !== 'pending') {
          clearInterval(check);
          resolve({
            status: hitl.status as HITLResponse['status'],
            responseData: hitl.responseData,
          });
          return;
        }

        if (deadline && Date.now() > deadline) {
          clearInterval(check);
          db.update(schema.hitlRequests)
            .set({ status: 'timeout' })
            .where(eq(schema.hitlRequests.id, hitlId))
            .run();
          resolve({ status: 'timeout', responseData: undefined });
        }
      }, 1000);
    });
  }

  abort(): void {
    this.abortController.abort();
  }

  private createHelpers(): NodeHelpers {
    return {
      httpRequest: async (options) => {
        const controller = new AbortController();
        const timeoutId = options.timeout
          ? setTimeout(() => controller.abort(), options.timeout)
          : null;

        try {
          const response = await fetch(options.url, {
            method: options.method || 'GET',
            headers: options.headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal,
          });

          const body = await response.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }

          return {
            statusCode: response.status,
            headers: Object.fromEntries(response.headers),
            body: parsed,
          };
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      },

      getCredential: async (name: string) => {
        const cred = await db
          .select()
          .from(schema.credentials)
          .where(eq(schema.credentials.name, name))
          .get();
        if (!cred) throw new Error(`Credential "${name}" not found`);
        // Parse JSON from buffer
        const dataStr = cred.data.toString('utf-8');
        return JSON.parse(dataStr);
      },
    };
  }
}
