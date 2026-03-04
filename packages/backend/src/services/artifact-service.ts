import * as fs from 'node:fs';
import * as path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

const generateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
};

const MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface CreateArtifactParams {
  caseId: string;
  name: string;
  filePath: string;
  mimeType?: string;
  size?: number;
  sourceType: 'upload' | 'skill_output' | 'generated';
  sourceStepId?: string;
  metadata?: Record<string, unknown>;
}

export async function createArtifact(params: CreateArtifactParams) {
  const mimeType = params.mimeType || inferMimeType(params.filePath);

  let size = params.size ?? 0;
  if (!size) {
    try {
      const absolutePath = path.isAbsolute(params.filePath)
        ? params.filePath
        : path.join(process.cwd(), params.filePath);
      const stat = fs.statSync(absolutePath);
      size = stat.size;
    } catch {
      // File may not exist yet or path is invalid
    }
  }

  const id = generateId();
  const now = new Date();

  db.insert(schema.caseArtifacts).values({
    id,
    caseId: params.caseId,
    name: params.name,
    filePath: params.filePath,
    mimeType,
    size,
    sourceType: params.sourceType,
    sourceStepId: params.sourceStepId,
    metadata: params.metadata as Record<string, unknown> | undefined,
    createdAt: now,
  }).run();

  return {
    id,
    caseId: params.caseId,
    name: params.name,
    filePath: params.filePath,
    mimeType,
    size,
    sourceType: params.sourceType,
    sourceStepId: params.sourceStepId,
    metadata: params.metadata,
    createdAt: now,
  };
}

export function getArtifactsForCase(caseId: string) {
  return db
    .select()
    .from(schema.caseArtifacts)
    .where(eq(schema.caseArtifacts.caseId, caseId))
    .all();
}

export async function deleteArtifact(id: string) {
  db.delete(schema.caseArtifacts)
    .where(eq(schema.caseArtifacts.id, id))
    .run();
}

export async function buildArtifactContext(caseId: string): Promise<string> {
  const artifacts = getArtifactsForCase(caseId);
  if (artifacts.length === 0) return '';

  const lines = ['## Available Case Files'];
  for (let i = 0; i < artifacts.length; i++) {
    const a = artifacts[i];
    const meta = a.metadata as Record<string, unknown> | null;
    const rowInfo = meta?.rowCount ? `, ${meta.rowCount} rows` : '';
    lines.push(`${i + 1}. [${a.sourceType}] ${a.name} (${formatFileSize(a.size)}${rowInfo})`);
  }

  return lines.join('\n');
}

export function findArtifactByName(caseId: string, name: string) {
  const artifacts = getArtifactsForCase(caseId);
  return artifacts.find((a) => a.name === name || path.basename(a.filePath) === name);
}
