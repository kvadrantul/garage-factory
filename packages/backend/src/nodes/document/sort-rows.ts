import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';

export const manifest: DocumentNodeManifest = {
  id: 'sort-rows',
  name: 'Sort Rows',
  category: 'transformation',
  description: 'Sort rows by a column ascending or descending',
  version: '1.0.0',
  icon: 'ArrowUpDown',
  color: 'blue',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'column',
      displayName: 'Column',
      type: 'string',
      required: true,
      description: 'Column name to sort by',
    },
    {
      name: 'direction',
      displayName: 'Direction',
      type: 'select',
      default: 'asc',
      options: [
        { label: 'Ascending', value: 'asc' },
        { label: 'Descending', value: 'desc' },
      ],
      description: 'Sort direction',
    },
    {
      name: 'valueType',
      displayName: 'Value Type',
      type: 'select',
      default: 'string',
      options: [
        { label: 'String', value: 'string' },
        { label: 'Number', value: 'number' },
        { label: 'Date', value: 'date' },
      ],
      description: 'How to interpret values when sorting',
    },
  ],
  dataContract: {
    inputShape: 'rows',
    outputShape: 'rows',
    outputFields: ['rows'],
  },
};

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      column?: string;
      direction?: 'asc' | 'desc';
      valueType?: 'string' | 'number' | 'date';
    };

    if (!config.column) throw new Error('column is required');

    const input = context.inputs.main[0] as { rows?: unknown[] } | undefined;
    const rows = [...((input?.rows ?? []) as Record<string, unknown>[])];
    const dir = config.direction === 'desc' ? -1 : 1;
    const valueType = config.valueType || 'string';

    rows.sort((a, b) => {
      const va = a[config.column!];
      const vb = b[config.column!];

      if (va === null || va === undefined) return 1 * dir;
      if (vb === null || vb === undefined) return -1 * dir;

      if (valueType === 'number') {
        return (Number(va) - Number(vb)) * dir;
      }

      if (valueType === 'date') {
        return (new Date(String(va)).getTime() - new Date(String(vb)).getTime()) * dir;
      }

      // string comparison
      return String(va).localeCompare(String(vb)) * dir;
    });

    return { data: { rows } };
  },
};
