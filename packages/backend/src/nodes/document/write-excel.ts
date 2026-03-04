import type { DocumentNodeManifest, NodeRunner } from '@garage-engine/shared';
import XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const manifest: DocumentNodeManifest = {
  id: 'write-excel',
  name: 'Write Excel',
  category: 'generation',
  description: 'Write rows to an Excel file',
  version: '1.0.0',
  icon: 'FileDown',
  color: 'green',
  inputs: [{ name: 'main', type: 'main' }],
  outputs: [{ name: 'main', type: 'main' }],
  properties: [
    {
      name: 'fileName',
      displayName: 'File Name',
      type: 'string',
      required: true,
      placeholder: 'output.xlsx',
      description: 'Name for the output Excel file',
    },
    {
      name: 'sheetName',
      displayName: 'Sheet Name',
      type: 'string',
      default: 'Sheet1',
      description: 'Name of the worksheet',
    },
    {
      name: 'outputDir',
      displayName: 'Output Directory',
      type: 'string',
      required: false,
      description: 'Output directory (defaults to artifacts/{caseId}/). Supports expressions.',
    },
  ],
  dataContract: {
    inputShape: 'rows',
    outputShape: 'file-path',
    outputFields: ['filePath', 'fileName', 'rowCount'],
  },
};

export const runner: NodeRunner = {
  async execute(context) {
    const config = context.node.data.config as {
      fileName?: string;
      sheetName?: string;
      outputDir?: string;
    };

    if (!config.fileName) throw new Error('fileName is required');

    const input = context.inputs.main[0] as { rows?: unknown[]; caseId?: string } | undefined;
    const rows = (input?.rows ?? []) as Record<string, unknown>[];
    const sheetName = config.sheetName || 'Sheet1';

    // Determine output directory
    let outputDir: string;
    if (config.outputDir) {
      outputDir = path.isAbsolute(config.outputDir)
        ? config.outputDir
        : path.join(process.cwd(), config.outputDir);
    } else {
      // Try to get caseId from input chain (trigger data flows through)
      const caseId = input?.caseId || 'default';
      outputDir = path.join(process.cwd(), 'artifacts', String(caseId));
    }

    fs.mkdirSync(outputDir, { recursive: true });

    const filePath = path.join(outputDir, config.fileName);
    const relativePath = path.relative(process.cwd(), filePath);

    // Build workbook
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filePath);

    return {
      data: {
        filePath: relativePath,
        fileName: config.fileName,
        rowCount: rows.length,
      },
    };
  },
};
