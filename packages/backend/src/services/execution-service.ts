import { eq } from 'drizzle-orm';
import { ExecutionRunner } from '../executor/execution-runner.js';
import { db, schema } from '../db/index.js';
import type { TriggerType, WorkflowDefinition, WorkflowSettings } from '@garage-engine/shared';

type BroadcastFn = (executionId: string, event: { type: string; payload: unknown }) => void;

let _instance: ExecutionService | null = null;

export class ExecutionService {
  private activeExecutions = new Map<string, ExecutionRunner>();
  private broadcast: BroadcastFn;

  constructor(broadcast: BroadcastFn) {
    this.broadcast = broadcast;
  }

  async executeWorkflow(
    workflowId: string,
    triggerType: TriggerType,
    triggerData: unknown,
  ): Promise<{ executionId: string }> {
    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId))
      .get();

    if (!workflow) throw new Error('Workflow not found');

    const definition = workflow.definition as WorkflowDefinition;
    const settings = (workflow.settings || {}) as WorkflowSettings;
    const runner = new ExecutionRunner(workflowId, definition, triggerType, triggerData, settings);

    const events = [
      'execution:started',
      'execution:completed',
      'execution:failed',
      'execution:node:started',
      'execution:node:completed',
      'execution:node:error',
      'hitl:required',
      'hitl:resolved',
    ];

    for (const event of events) {
      runner.on(event, (payload: unknown) => {
        const p = payload as { executionId?: string };
        if (p?.executionId) {
          this.broadcast(p.executionId, { type: event, payload });
        }
      });
    }

    const resultPromise = runner.execute();

    const executionId = await new Promise<string>((resolve) => {
      runner.once('execution:started', (data: { executionId: string }) => {
        resolve(data.executionId);
      });
    });

    this.activeExecutions.set(executionId, runner);

    resultPromise.finally(() => {
      this.activeExecutions.delete(executionId);
    });

    return { executionId };
  }

  async stopExecution(executionId: string): Promise<void> {
    const runner = this.activeExecutions.get(executionId);
    if (runner) {
      runner.abort();
      this.activeExecutions.delete(executionId);
    }

    await db
      .update(schema.executions)
      .set({ status: 'stopped', finishedAt: new Date() })
      .where(eq(schema.executions.id, executionId));
  }

  isRunning(executionId: string): boolean {
    return this.activeExecutions.has(executionId);
  }
}

export function initExecutionService(broadcast: BroadcastFn): ExecutionService {
  _instance = new ExecutionService(broadcast);
  return _instance;
}

export function getExecutionService(): ExecutionService {
  if (!_instance) throw new Error('ExecutionService not initialized');
  return _instance;
}
