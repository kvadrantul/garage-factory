import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';

export const manifest: DocumentNodeManifest = {
  id: 'select-columns',
  name: 'Select Columns',
  category: 'transformation',
  description: 'Pick, rename, or reorder columns from rows',
  version: '1.0.0',
  icon: 'Columns',
  color: 'blue',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'columns',
      displayName: 'Columns',
      type: 'json',
      required: true,
      default: [],
      description: 'Array of { source: string, target?: string } — columns to keep and optionally rename',
    },
    {
      name: 'dropOthers',
      displayName: 'Drop Other Columns',
      type: 'boolean',
      default: true,
      description: 'Remove columns not listed',
    },
  ],
  dataContract: {
    inputShape: 'rows',
    outputShape: 'rows',
    outputFields: ['rows', 'columns'],
  },
};

interface ColumnSpec {
  source: string;
  target?: string;
}

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      columns?: ColumnSpec[];
      dropOthers?: boolean;
    };

    const columns = config.columns ?? [];
    if (columns.length === 0) throw new Error('columns array is required and must not be empty');

    const input = context.inputs.main[0] as { rows?: unknown[] } | undefined;
    const rows = (input?.rows ?? []) as Record<string, unknown>[];
    const dropOthers = config.dropOthers !== false;

    const mappedRows = rows.map((row) => {
      if (dropOthers) {
        const newRow: Record<string, unknown> = {};
        for (const col of columns) {
          const targetKey = col.target || col.source;
          newRow[targetKey] = row[col.source];
        }
        return newRow;
      } else {
        const newRow: Record<string, unknown> = { ...row };
        for (const col of columns) {
          if (col.target && col.target !== col.source) {
            newRow[col.target] = row[col.source];
            delete newRow[col.source];
          }
        }
        return newRow;
      }
    });

    const outputColumns = mappedRows.length > 0 ? Object.keys(mappedRows[0]) : [];

    return {
      data: {
        rows: mappedRows,
        columns: outputColumns,
      },
    };
  },
};
