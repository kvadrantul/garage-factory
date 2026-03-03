import type { NodeRunner, NodeContext, NodeResult } from '@orchestrator/shared';

export const manualTrigger: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const triggerData = context.inputs.main[0];
    return {
      data: {
        timestamp: new Date().toISOString(),
        triggerData,
      },
    };
  },
};
