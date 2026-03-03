import type { NodeRunner, NodeContext, NodeResult } from '@orchestrator/shared';

export const mergeNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as { mode?: 'append' | 'combine' | 'wait' };
    const inputs = context.inputs.main;

    let merged: unknown;

    switch (config.mode) {
      case 'combine': {
        // Deep merge objects
        merged = inputs.reduce((acc: Record<string, unknown>, item) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            return { ...acc, ...item as Record<string, unknown> };
          }
          return acc;
        }, {});
        break;
      }
      case 'append':
      default: {
        // Concatenate into array
        merged = inputs.flat();
        break;
      }
    }

    return { data: merged };
  },
};
