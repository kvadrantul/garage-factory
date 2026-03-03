import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

export const scheduleTrigger: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const triggerData = context.inputs.main[0] as Record<string, unknown>;
    return {
      data: {
        timestamp: new Date().toISOString(),
        scheduled: triggerData?.scheduled ?? new Date().toISOString(),
      },
    };
  },
};
