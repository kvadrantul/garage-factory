import type { DocumentNodeManifest } from '@garage-engine/shared';
import { registerNode } from '../registry.js';

import * as readExcel from './read-excel.js';
import * as filterRows from './filter-rows.js';
import * as groupBy from './group-by.js';
import * as sortRows from './sort-rows.js';
import * as selectColumns from './select-columns.js';
import * as formatOutput from './format-output.js';
import * as writeExcel from './write-excel.js';

const documentNodes = [
  readExcel,
  filterRows,
  groupBy,
  sortRows,
  selectColumns,
  formatOutput,
  writeExcel,
];

export const documentNodeManifests: DocumentNodeManifest[] = documentNodes.map((n) => n.manifest);

export function loadDocumentNodes(): void {
  for (const node of documentNodes) {
    registerNode(node.manifest.id, node.runner);
  }
  console.log(
    `Loaded ${documentNodes.length} document node(s): ${documentNodes.map((n) => n.manifest.id).join(', ')}`,
  );
}
