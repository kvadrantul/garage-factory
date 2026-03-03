import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export const switchNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as {
      value: string;
      cases: { value: unknown; label: string }[];
      fallback?: boolean;
    };
    const input = context.inputs.main[0];

    const switchValue = getNestedValue(input, config.value);
    const matchIndex = (config.cases || []).findIndex((c) => c.value == switchValue);

    let outputIndex: number;
    if (matchIndex >= 0) {
      outputIndex = matchIndex;
    } else if (config.fallback) {
      outputIndex = config.cases.length; // fallback is last output
    } else {
      outputIndex = 0;
    }

    return {
      data: input,
      outputIndex,
    };
  },
};
