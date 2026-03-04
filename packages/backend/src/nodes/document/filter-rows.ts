import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';

export const manifest: DocumentNodeManifest = {
  id: 'filter-rows',
  name: 'Filter Rows',
  category: 'transformation',
  description: 'Filter rows by column condition',
  version: '1.0.0',
  icon: 'Filter',
  color: 'blue',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'column',
      displayName: 'Column',
      type: 'string',
      required: true,
      description: 'Column name to filter on',
    },
    {
      name: 'operator',
      displayName: 'Operator',
      type: 'select',
      required: true,
      default: 'eq',
      options: [
        { label: 'Equals', value: 'eq' },
        { label: 'Not Equals', value: 'neq' },
        { label: 'Greater Than', value: 'gt' },
        { label: 'Greater Than or Equal', value: 'gte' },
        { label: 'Less Than', value: 'lt' },
        { label: 'Less Than or Equal', value: 'lte' },
        { label: 'Contains', value: 'contains' },
        { label: 'Not Contains', value: 'not_contains' },
        { label: 'Starts With', value: 'starts_with' },
        { label: 'In List', value: 'in' },
        { label: 'Is Empty', value: 'is_empty' },
        { label: 'Is Not Empty', value: 'is_not_empty' },
      ],
      description: 'Comparison operator',
    },
    {
      name: 'value',
      displayName: 'Value',
      type: 'string',
      required: false,
      default: '',
      description: 'Value to compare against (not needed for is_empty/is_not_empty)',
    },
    {
      name: 'valueType',
      displayName: 'Value Type',
      type: 'select',
      default: 'string',
      options: [
        { label: 'String', value: 'string' },
        { label: 'Number', value: 'number' },
        { label: 'Boolean', value: 'boolean' },
      ],
      description: 'Type to coerce the value to before comparison',
    },
  ],
  dataContract: {
    inputShape: 'rows',
    outputShape: 'rows',
    outputFields: ['rows', 'filteredCount', 'originalCount'],
  },
};

type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'starts_with' | 'in' | 'is_empty' | 'is_not_empty';

function coerceValue(val: unknown, type: string): unknown {
  if (val === null || val === undefined) return val;
  const s = String(val);
  if (type === 'number') return Number(s);
  if (type === 'boolean') return s === 'true' || s === '1';
  return s;
}

function matchRow(cellValue: unknown, operator: Operator, compareValue: unknown): boolean {
  switch (operator) {
    case 'eq': return cellValue === compareValue;
    case 'neq': return cellValue !== compareValue;
    case 'gt': return Number(cellValue) > Number(compareValue);
    case 'gte': return Number(cellValue) >= Number(compareValue);
    case 'lt': return Number(cellValue) < Number(compareValue);
    case 'lte': return Number(cellValue) <= Number(compareValue);
    case 'contains': return String(cellValue).toLowerCase().includes(String(compareValue).toLowerCase());
    case 'not_contains': return !String(cellValue).toLowerCase().includes(String(compareValue).toLowerCase());
    case 'starts_with': return String(cellValue).toLowerCase().startsWith(String(compareValue).toLowerCase());
    case 'in': {
      const list = String(compareValue).split(',').map((s) => s.trim());
      return list.includes(String(cellValue));
    }
    case 'is_empty': return cellValue === null || cellValue === undefined || cellValue === '';
    case 'is_not_empty': return cellValue !== null && cellValue !== undefined && cellValue !== '';
    default: return true;
  }
}

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      column?: string;
      operator?: Operator;
      value?: string;
      valueType?: string;
    };

    if (!config.column) throw new Error('column is required');

    const input = context.inputs.main[0] as { rows?: unknown[] } | undefined;
    const rows = (input?.rows ?? []) as Record<string, unknown>[];
    const operator = config.operator || 'eq';
    const valueType = config.valueType || 'string';
    const compareValue = coerceValue(config.value, valueType);

    const filtered = rows.filter((row) => {
      const cellValue = coerceValue(row[config.column!], valueType);
      return matchRow(cellValue, operator, compareValue);
    });

    return {
      data: {
        rows: filtered,
        filteredCount: filtered.length,
        originalCount: rows.length,
      },
    };
  },
};
