import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

interface Condition {
  field: string;
  operation: string;
  value: unknown;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateCondition(input: unknown, condition: Condition): boolean {
  const fieldValue = getNestedValue(input, condition.field);
  const compareValue = condition.value;

  switch (condition.operation) {
    case 'equals':
      return fieldValue == compareValue;
    case 'notEquals':
      return fieldValue != compareValue;
    case 'contains':
      return typeof fieldValue === 'string' && fieldValue.includes(String(compareValue));
    case 'gt':
      return Number(fieldValue) > Number(compareValue);
    case 'lt':
      return Number(fieldValue) < Number(compareValue);
    case 'gte':
      return Number(fieldValue) >= Number(compareValue);
    case 'lte':
      return Number(fieldValue) <= Number(compareValue);
    case 'isEmpty':
      return fieldValue == null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'isNotEmpty':
      return fieldValue != null && fieldValue !== '' && !(Array.isArray(fieldValue) && fieldValue.length === 0);
    default:
      return false;
  }
}

export const ifNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config as {
      conditions: Condition[];
      combineOperation?: 'AND' | 'OR';
    };
    const input = context.inputs.main[0];

    const results = (config.conditions || []).map((cond) => evaluateCondition(input, cond));

    const passed =
      config.combineOperation === 'OR'
        ? results.some((r) => r)
        : results.every((r) => r);

    return {
      data: input,
      outputIndex: passed ? 0 : 1,
    };
  },
};
