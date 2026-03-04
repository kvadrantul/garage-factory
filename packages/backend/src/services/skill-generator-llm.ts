// Skill Generator LLM Service
// Uses OpenClaw CLI to generate workflow definitions from natural language descriptions

import { spawn } from 'child_process';
import { nanoid } from 'nanoid';
import type {
  DocumentNodeManifest,
  WorkflowDefinition,
  SkillGenerationResult,
} from '@garage-engine/shared';
import { documentNodeManifests } from '../nodes/document/loader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format all document node manifests into compact LLM-readable catalog text.
 */
function buildNodeCatalogText(manifests: DocumentNodeManifest[]): string {
  const lines: string[] = [];

  for (const m of manifests) {
    lines.push(`### ${m.id} (${m.category})`);
    lines.push(`${m.description}`);
    lines.push(`Properties:`);
    for (const p of m.properties) {
      const req = p.required ? ' (REQUIRED)' : '';
      const def = p.default !== undefined ? ` [default: ${JSON.stringify(p.default)}]` : '';
      const opts =
        p.options && Array.isArray(p.options)
          ? ` Options: ${(p.options as { value: string }[]).map((o) => o.value).join(', ')}`
          : '';
      lines.push(`  - ${p.name} (${p.type})${req}${def}: ${p.description || ''}${opts}`);
    }
    lines.push(`Output fields: ${m.dataContract.outputFields.join(', ')}`);
    lines.push(`Data flow: ${m.dataContract.inputShape} → ${m.dataContract.outputShape}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the system prompt for the skill generation LLM call.
 */
function buildSystemPrompt(catalog: string): string {
  return `## Role
You are a workflow architect for a document processing system.
Your job is to design a minimal, correct workflow from a natural language description.
Return ONLY valid JSON. No markdown, no prose, no explanation — just the JSON object.

## Available Nodes
${catalog}

## Expression Syntax
- Runtime inputs (from user at execution time): {{ $input.bridgeInputs.PARAM_NAME }}
- Upstream node output: {{ $node["NodeName"].FIELD_NAME }}
- Use expressions wherever a value should come from user input or a previous step.
- Data (rows) flows automatically between connected nodes — you do NOT need expressions for the rows array itself. Only use expressions for config properties like column names, thresholds, file paths, etc.

## Output Format
Return ONLY a JSON object matching this exact structure:
{
  "workflowName": "Human-readable workflow name",
  "nodes": [
    { "type": "node-type-id", "name": "Human-readable step name", "config": { ... } }
  ],
  "toolName": "snake_case_tool_name",
  "name": "Human-readable Skill Name",
  "shortDescription": "One-sentence description of what this skill does",
  "whenToApply": "When the user asks to ... (guidance for the AI agent on when to use this skill)",
  "inputsSchema": {
    "type": "object",
    "properties": {
      "filePath": { "type": "string", "description": "Path to the input file" }
    },
    "required": ["filePath"]
  }
}

## Rules
1. Only use node types from the catalog above. Never invent new types.
2. Every workflow that reads a file MUST start with "read-excel".
3. Every workflow that produces a file MUST end with "write-excel".
4. Every workflow that should produce text output (not a file) should end with "format-output".
5. Parameters that come from the user at runtime MUST use {{ $input.bridgeInputs.X }} expressions in the config.
6. Include ALL runtime parameters in inputsSchema with proper types and descriptions.
7. filePath is almost always a required input — include it in inputsSchema.
8. Keep the pipeline minimal: only include nodes that are necessary.
9. Node "name" should be descriptive (e.g. "Filter by Amount", not "filter-rows-1").
10. toolName must be snake_case, 3–50 characters, starting with a letter.

## Example

Description: "Read an Excel bank statement, filter transactions where amount is greater than a threshold, group by counterparty BIK, output a summary Excel file"

Response:
{
  "workflowName": "Filter and group transactions by BIK",
  "nodes": [
    { "type": "read-excel", "name": "Read Statement", "config": { "filePath": "{{ $input.bridgeInputs.filePath }}", "hasHeader": true } },
    { "type": "filter-rows", "name": "Filter by Amount", "config": { "column": "{{ $input.bridgeInputs.amountColumn }}", "operator": "gt", "value": "{{ $input.bridgeInputs.threshold }}", "valueType": "number" } },
    { "type": "group-by", "name": "Group by BIK", "config": { "groupColumn": "{{ $input.bridgeInputs.bikColumn }}", "aggregations": [{"column": "{{ $input.bridgeInputs.amountColumn }}", "fn": "sum", "outputColumn": "total_amount"}, {"column": "{{ $input.bridgeInputs.amountColumn }}", "fn": "count", "outputColumn": "transaction_count"}] } },
    { "type": "write-excel", "name": "Write Summary", "config": { "fileName": "summary.xlsx", "sheetName": "Summary" } }
  ],
  "toolName": "filter_transactions_by_bik",
  "name": "Filter Transactions by BIK",
  "shortDescription": "Filters bank statement transactions above a threshold and groups them by counterparty BIK",
  "whenToApply": "Use when the user asks to analyze or summarize transactions from a bank statement Excel file by BIK or counterparty",
  "inputsSchema": {
    "type": "object",
    "properties": {
      "filePath": { "type": "string", "description": "Path to the Excel bank statement file" },
      "threshold": { "type": "number", "description": "Minimum transaction amount to include", "default": 1000000 },
      "amountColumn": { "type": "string", "description": "Column name containing the transaction amount", "default": "amount" },
      "bikColumn": { "type": "string", "description": "Column name containing the BIK/counterparty code", "default": "bik" }
    },
    "required": ["filePath"]
  }
}`;
}

/**
 * Build the user message for the LLM call.
 */
function buildUserMessage(
  description: string,
  sampleData?: Record<string, unknown>[],
): string {
  let message = `Design a workflow for: ${description}`;

  if (sampleData && sampleData.length > 0) {
    const columns = Object.keys(sampleData[0]);
    message += `\n\nSample data (first ${sampleData.length} rows):\n`;
    message += JSON.stringify(sampleData.slice(0, 5), null, 2);
    message += `\n\nAvailable columns: ${columns.join(', ')}`;
  }

  return message;
}

/**
 * Spawn OpenClaw CLI for one-shot generation.
 */
function callOpenClawForGeneration(
  agentId: string,
  systemPrompt: string,
  userMessage: string,
): Promise<{ content: string; error?: string }> {
  return new Promise((resolve) => {
    const args = ['agent', '--agent', agentId, '--system', systemPrompt, '-m', userMessage, '--json'];

    const proc = spawn('openclaw', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    const chunks: string[] = [];
    let errorOutput = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk.toString());
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      errorOutput += chunk.toString();
    });

    proc.on('error', (err) => {
      resolve({ content: '', error: `Failed to spawn openclaw: ${err.message}` });
    });

    proc.on('close', (code) => {
      const content = chunks.join('').trim();
      if (code === 0 && content) {
        resolve({ content });
      } else {
        resolve({
          content,
          error: errorOutput || `openclaw exited with code ${code}`,
        });
      }
    });

    // 90 second timeout
    setTimeout(() => {
      proc.kill();
      resolve({ content: '', error: 'Generation timed out (90s)' });
    }, 90_000);
  });
}

/**
 * Extract JSON from LLM response that may be wrapped in markdown fences or prose.
 */
function parseGenerationResponse(content: string): Record<string, unknown> {
  // Try parsing the --json structured output first
  try {
    const parsed = JSON.parse(content);
    // OpenClaw --json wraps response in { content: "..." } or similar
    if (parsed.content && typeof parsed.content === 'string') {
      return parseGenerationResponse(parsed.content);
    }
    // If parsed object looks like our expected shape, return it
    if (parsed.workflowName || parsed.nodes) {
      return parsed;
    }
    // If it's some other wrapper, check for a text/message field
    const text = parsed.text || parsed.message || parsed.response || parsed.content;
    if (typeof text === 'string') {
      return parseGenerationResponse(text);
    }
    return parsed;
  } catch {
    // Not direct JSON — try extracting from markdown fences or prose
  }

  // Strip ```json ... ``` fences
  const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Fall through
    }
  }

  // Find first { to last }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {
      // Fall through
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${content.slice(0, 200)}...`);
}

// Draft shape returned by the LLM
interface WorkflowDraft {
  workflowName: string;
  nodes: { type: string; name: string; config: Record<string, unknown> }[];
  toolName: string;
  name: string;
  shortDescription: string;
  whenToApply: string;
  inputsSchema: Record<string, unknown>;
}

/**
 * Validate a parsed workflow draft.
 */
function validateWorkflowDraft(
  draft: Record<string, unknown>,
  validNodeTypes: Set<string>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check nodes
  const nodes = draft.nodes as { type: string }[] | undefined;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    errors.push('No nodes defined — the workflow must have at least one node.');
  } else {
    for (const node of nodes) {
      if (!validNodeTypes.has(node.type)) {
        errors.push(`Unknown node type: "${node.type}". Valid types: ${[...validNodeTypes].join(', ')}`);
      }
    }
  }

  // Check toolName
  const toolName = draft.toolName as string | undefined;
  if (!toolName || !/^[a-z][a-z0-9_]{2,49}$/.test(toolName)) {
    errors.push('toolName must be snake_case, 3–50 characters, starting with a lowercase letter.');
  }

  if (!draft.workflowName || typeof draft.workflowName !== 'string') {
    errors.push('workflowName is required and must be a non-empty string.');
  }
  if (!draft.shortDescription || typeof draft.shortDescription !== 'string') {
    errors.push('shortDescription is required.');
  }
  if (!draft.whenToApply || typeof draft.whenToApply !== 'string') {
    errors.push('whenToApply is required.');
  }

  // Check inputsSchema
  const schema = draft.inputsSchema as Record<string, unknown> | undefined;
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    errors.push('inputsSchema must be a JSON Schema object with type: "object" and properties.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convert a validated draft into a proper WorkflowDefinition.
 */
function convertDraftToWorkflow(draft: WorkflowDraft): WorkflowDefinition {
  const nodes: WorkflowDefinition['nodes'] = [];
  const edges: WorkflowDefinition['edges'] = [];

  // Add manual-trigger as the first node
  const triggerId = `trigger_${nanoid(8)}`;
  nodes.push({
    id: triggerId,
    type: 'manual-trigger',
    position: { x: 100, y: 200 },
    data: { name: 'Trigger', config: {} },
  });

  // Add each document node
  let prevId = triggerId;
  for (let i = 0; i < draft.nodes.length; i++) {
    const draftNode = draft.nodes[i];
    const nodeId = `node_${nanoid(8)}`;

    nodes.push({
      id: nodeId,
      type: draftNode.type as any,
      position: { x: 100 + (i + 1) * 250, y: 200 },
      data: { name: draftNode.name, config: draftNode.config },
    });

    edges.push({
      id: `e_${prevId}_${nodeId}`,
      source: prevId,
      target: nodeId,
    });

    prevId = nodeId;
  }

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { errorHandling: 'stop', timeout: 300_000 },
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface GenerateParams {
  description: string;
  domainId: string;
  agentId: string;
  domainSystemPrompt?: string;
  sampleData?: Record<string, unknown>[];
}

export async function generateWorkflowFromDescription(
  params: GenerateParams,
): Promise<SkillGenerationResult> {
  const { description, agentId, sampleData } = params;

  const validNodeTypes = new Set(documentNodeManifests.map((m) => m.id));
  const catalog = buildNodeCatalogText(documentNodeManifests);
  const systemPrompt = buildSystemPrompt(catalog);
  const userMessage = buildUserMessage(description, sampleData);

  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = attempt === 0
      ? userMessage
      : `${userMessage}\n\nCORRECTION NEEDED: ${lastError}\nReturn ONLY valid JSON, no other text.`;

    console.log(`[skill-gen] Attempt ${attempt + 1}: calling OpenClaw CLI for agent ${agentId}`);

    const result = await callOpenClawForGeneration(agentId, systemPrompt, msg);

    if (result.error && !result.content) {
      throw new Error(`OpenClaw CLI error: ${result.error}`);
    }

    let draft: Record<string, unknown>;
    try {
      draft = parseGenerationResponse(result.content);
    } catch (parseErr) {
      lastError = `Failed to parse JSON: ${(parseErr as Error).message}`;
      console.warn(`[skill-gen] Attempt ${attempt + 1} parse failed:`, lastError);
      if (attempt === 1) {
        throw new Error(`Skill generation failed after 2 attempts. Last error: ${lastError}`);
      }
      continue;
    }

    const validation = validateWorkflowDraft(draft, validNodeTypes);
    if (!validation.valid) {
      lastError = validation.errors.join('. ');
      console.warn(`[skill-gen] Attempt ${attempt + 1} validation failed:`, lastError);
      if (attempt === 1) {
        throw new Error(`Skill generation failed after 2 attempts. Validation errors: ${lastError}`);
      }
      continue;
    }

    // Convert to proper WorkflowDefinition
    const typedDraft = draft as unknown as WorkflowDraft;
    const workflowDefinition = convertDraftToWorkflow(typedDraft);

    console.log(
      `[skill-gen] Success: generated "${typedDraft.toolName}" with ${typedDraft.nodes.length} nodes`,
    );

    return {
      workflowDefinition,
      scenario: {
        toolName: typedDraft.toolName,
        name: typedDraft.name,
        shortDescription: typedDraft.shortDescription,
        whenToApply: typedDraft.whenToApply,
        inputsSchema: typedDraft.inputsSchema,
      },
      generationLog: `Generated in ${attempt + 1} attempt(s). Nodes: ${typedDraft.nodes.map((n) => n.type).join(' → ')}`,
    };
  }

  // Should not reach here, but just in case
  throw new Error(`Skill generation failed: ${lastError}`);
}
