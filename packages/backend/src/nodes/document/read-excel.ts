import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';
import XLSX from 'xlsx';
import * as path from 'node:path';

export const manifest: DocumentNodeManifest = {
  id: 'read-excel',
  name: 'Read Excel',
  category: 'extraction',
  description: 'Parse Excel/CSV file into array of row objects',
  version: '2.0.0',
  icon: 'FileSpreadsheet',
  color: 'green',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'filePath',
      displayName: 'File Path',
      type: 'string',
      required: true,
      placeholder: '/path/to/file.xlsx',
      description: 'Path to the Excel/CSV file',
    },
    {
      name: 'sheetName',
      displayName: 'Sheet Name',
      type: 'string',
      required: false,
      default: '',
      placeholder: 'Sheet1',
      description: 'Leave empty to use the first sheet',
    },
    {
      name: 'hasHeader',
      displayName: 'First Row is Header',
      type: 'boolean',
      default: true,
      description: 'Use first row values as column names',
    },
  ],
  dataContract: {
    inputShape: 'any',
    outputShape: 'rows',
    outputFields: ['rows', 'totalRows', 'columns', 'sheetName', 'availableSheets'],
  },
};

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      filePath?: string;
      sheetName?: string;
      hasHeader?: boolean;
    };

    if (!config.filePath) {
      throw new Error('filePath is required');
    }

    const filePath = path.isAbsolute(config.filePath)
      ? config.filePath
      : path.join(process.cwd(), config.filePath);

    const workbook = XLSX.readFile(filePath);

    const sheetName =
      config.sheetName && workbook.SheetNames.includes(config.sheetName)
        ? config.sheetName
        : workbook.SheetNames[0];

    const hasHeader = config.hasHeader !== false;

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: hasHeader ? undefined : 1,
    }) as Record<string, unknown>[];

    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return {
      data: {
        rows,
        totalRows: rows.length,
        columns,
        sheetName,
        availableSheets: workbook.SheetNames,
      },
    };
  },
};
