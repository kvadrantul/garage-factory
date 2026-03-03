import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

export const setNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as {
      values?: Record<string, unknown>;
      mode?: 'set' | 'append' | 'remove';
      keepOnlySet?: boolean;
    };
    const input = context.inputs.main[0];
    const inputObj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

    let output: Record<string, unknown>;

    switch (config.mode) {
      case 'remove': {
        output = { ...inputObj };
        for (const key of Object.keys(config.values || {})) {
          delete output[key];
        }
        break;
      }
      case 'append': {
        output = { ...inputObj };
        for (const [key, value] of Object.entries(config.values || {})) {
          const existing = output[key];
          if (Array.isArray(existing)) {
            output[key] = [...existing, value];
          } else {
            output[key] = value;
          }
        }
        break;
      }
      case 'set':
      default: {
        if (config.keepOnlySet) {
          output = { ...config.values };
        } else {
          output = { ...inputObj, ...config.values };
        }
        break;
      }
    }

    return { data: output };
  },
};
