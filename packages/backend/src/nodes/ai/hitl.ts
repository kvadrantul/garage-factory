import type { NodeRunner, NodeContext, NodeResult } from '@orchestrator/shared';

export const hitlNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as {
      type?: 'approval' | 'input' | 'selection';
      message?: string;
      details?: string;
      timeout?: number;
      fields?: { name: string; type: string; label: string; required?: boolean }[];
      options?: { label: string; value: string; description?: string }[];
    };
    const input = context.inputs.main[0];

    return {
      data: input,
      waitForHitl: {
        type: config.type || 'approval',
        message: config.message || 'Awaiting human approval',
        details: config.details,
        fields: config.fields,
        options: config.options,
        timeoutSeconds: config.timeout || 3600,
      },
    };
  },
};
