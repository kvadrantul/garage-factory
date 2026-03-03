import type { NodeRunner, NodeContext, NodeResult } from '@orchestrator/shared';

export const webhookTrigger: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const triggerData = context.inputs.main[0] as Record<string, unknown>;
    return {
      data: {
        headers: triggerData?.headers,
        query: triggerData?.query,
        body: triggerData?.body,
        method: triggerData?.method,
        path: triggerData?.path,
      },
    };
  },
};
