import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';

export const manifest: DocumentNodeManifest = {
  id: 'format-output',
  name: 'Format Output',
  category: 'generation',
  description: 'Format data as table, summary, markdown, or JSON for human consumption',
  version: '1.0.0',
  icon: 'FileText',
  color: 'orange',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'format',
      displayName: 'Format',
      type: 'select',
      default: 'table',
      options: [
        { label: 'ASCII Table', value: 'table' },
        { label: 'Summary', value: 'summary' },
        { label: 'Markdown Table', value: 'markdown' },
        { label: 'JSON', value: 'json' },
      ],
      description: 'Output format',
    },
    {
      name: 'title',
      displayName: 'Title',
      type: 'string',
      required: false,
      default: '',
      description: 'Optional title for the output',
    },
    {
      name: 'maxRows',
      displayName: 'Max Rows',
      type: 'number',
      default: 50,
      description: 'Maximum number of rows to display',
    },
  ],
  dataContract: {
    inputShape: 'any',
    outputShape: 'scalar',
    outputFields: ['text', 'format'],
  },
};

function formatAsTable(rows: Record<string, unknown>[], maxRows: number): string {
  if (rows.length === 0) return '(no data)';

  const displayRows = rows.slice(0, maxRows);
  const keys = Object.keys(displayRows[0]);

  // Calculate column widths
  const widths = keys.map((k) => {
    const maxVal = Math.max(
      k.length,
      ...displayRows.map((r) => String(r[k] ?? '').length),
    );
    return Math.min(maxVal, 30); // cap at 30 chars
  });

  const separator = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const header = '|' + keys.map((k, i) => ` ${k.padEnd(widths[i])} `).join('|') + '|';

  const dataLines = displayRows.map((row) =>
    '|' + keys.map((k, i) => {
      const val = String(row[k] ?? '').slice(0, 30);
      return ` ${val.padEnd(widths[i])} `;
    }).join('|') + '|',
  );

  const lines = [separator, header, separator, ...dataLines, separator];

  if (rows.length > maxRows) {
    lines.push(`... and ${rows.length - maxRows} more rows`);
  }

  return lines.join('\n');
}

function formatAsMarkdown(rows: Record<string, unknown>[], maxRows: number): string {
  if (rows.length === 0) return '(no data)';

  const displayRows = rows.slice(0, maxRows);
  const keys = Object.keys(displayRows[0]);

  const header = '| ' + keys.join(' | ') + ' |';
  const divider = '| ' + keys.map(() => '---').join(' | ') + ' |';
  const dataLines = displayRows.map((row) =>
    '| ' + keys.map((k) => String(row[k] ?? '')).join(' | ') + ' |',
  );

  const lines = [header, divider, ...dataLines];

  if (rows.length > maxRows) {
    lines.push(`\n*... and ${rows.length - maxRows} more rows*`);
  }

  return lines.join('\n');
}

function formatAsSummary(data: unknown): string {
  if (Array.isArray(data)) {
    return `Total items: ${data.length}\n` +
      (data.length > 0 ? `Columns: ${Object.keys(data[0] as object).join(', ')}` : '');
  }

  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('\n');
  }

  return String(data);
}

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      format?: string;
      title?: string;
      maxRows?: number;
    };

    const input = context.inputs.main[0] as { rows?: unknown[] } | unknown;
    const inputObj = input as Record<string, unknown> | null;
    const rows = (inputObj?.rows ?? (Array.isArray(input) ? input : [])) as Record<string, unknown>[];
    const format = config.format || 'table';
    const maxRows = config.maxRows ?? 50;
    const title = config.title || '';

    let text: string;

    switch (format) {
      case 'table':
        text = formatAsTable(rows, maxRows);
        break;
      case 'markdown':
        text = formatAsMarkdown(rows, maxRows);
        break;
      case 'summary':
        text = formatAsSummary(inputObj ?? input);
        break;
      case 'json':
        text = JSON.stringify(rows.slice(0, maxRows), null, 2);
        break;
      default:
        text = formatAsTable(rows, maxRows);
    }

    if (title) {
      text = `${title}\n${'='.repeat(title.length)}\n\n${text}`;
    }

    return {
      data: { text, format },
    };
  },
};
