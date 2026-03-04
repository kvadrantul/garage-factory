import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';

export const manifest: DocumentNodeManifest = {
  id: 'group-by',
  name: 'Group By',
  category: 'transformation',
  description: 'Group rows by column and apply aggregations (sum, count, avg, min, max)',
  version: '1.0.0',
  icon: 'Group',
  color: 'purple',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'groupColumn',
      displayName: 'Group Column',
      type: 'string',
      required: true,
      description: 'Column name to group by',
    },
    {
      name: 'aggregations',
      displayName: 'Aggregations',
      type: 'json',
      required: true,
      default: [],
      description: 'Array of { column, fn: sum|count|avg|min|max|first|last, outputColumn? }',
    },
    {
      name: 'includeRows',
      displayName: 'Include Source Rows',
      type: 'boolean',
      default: false,
      description: 'Embed original rows in each group',
    },
  ],
  dataContract: {
    inputShape: 'rows',
    outputShape: 'rows',
    outputFields: ['rows', 'groupCount'],
  },
};

interface Aggregation {
  column: string;
  fn: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'first' | 'last';
  outputColumn?: string;
}

function aggregate(rows: Record<string, unknown>[], agg: Aggregation): unknown {
  const values = rows.map((r) => r[agg.column]);

  switch (agg.fn) {
    case 'count':
      return values.length;
    case 'sum':
      return values.reduce((acc: number, v) => acc + (Number(v) || 0), 0);
    case 'avg': {
      const nums = values.map((v) => Number(v) || 0);
      return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    }
    case 'min':
      return values.length > 0 ? Math.min(...values.map((v) => Number(v) || 0)) : 0;
    case 'max':
      return values.length > 0 ? Math.max(...values.map((v) => Number(v) || 0)) : 0;
    case 'first':
      return values[0];
    case 'last':
      return values[values.length - 1];
    default:
      return null;
  }
}

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      groupColumn?: string;
      aggregations?: Aggregation[];
      includeRows?: boolean;
    };

    if (!config.groupColumn) throw new Error('groupColumn is required');

    const input = context.inputs.main[0] as { rows?: unknown[] } | undefined;
    const rows = (input?.rows ?? []) as Record<string, unknown>[];
    const aggregations = config.aggregations ?? [];

    // Group rows
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = String(row[config.groupColumn] ?? '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Build output rows
    const outputRows: Record<string, unknown>[] = [];
    for (const [key, groupRows] of groups) {
      const outputRow: Record<string, unknown> = {
        [config.groupColumn]: key,
        _count: groupRows.length,
      };

      for (const agg of aggregations) {
        const outCol = agg.outputColumn || `${agg.column}_${agg.fn}`;
        outputRow[outCol] = aggregate(groupRows, agg);
      }

      if (config.includeRows) {
        outputRow._rows = groupRows;
      }

      outputRows.push(outputRow);
    }

    return {
      data: {
        rows: outputRows,
        groupCount: outputRows.length,
      },
    };
  },
};
