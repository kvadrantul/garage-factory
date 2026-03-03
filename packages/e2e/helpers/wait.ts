import { api } from './api.js';

/**
 * Polls execution status until completed or failed.
 * Throws if timeout is reached.
 */
export async function waitForExecution(
  executionId: string,
  timeout = 15_000,
): Promise<Record<string, unknown>> {
  const interval = 500;
  const maxAttempts = Math.ceil(timeout / interval);

  for (let i = 0; i < maxAttempts; i++) {
    const execution = await api.getExecution(executionId);
    const status = execution.status as string;

    if (status === 'completed' || status === 'failed') {
      return execution;
    }

    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Execution ${executionId} did not complete within ${timeout}ms`);
}
