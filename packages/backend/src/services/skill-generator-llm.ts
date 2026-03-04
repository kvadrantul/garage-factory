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
    lines.push(`Output fields: ${(m.dataContract.outputFields ?? []).join(', ')}`);
    lines.push(`Data flow: ${m.dataContract.inputShape} → ${m.dataContract.outputShape}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Core (non-document) node catalog for general-purpose workflow generation.
 */
function buildCoreNodeCatalogText(): string {
  return `### http-request (action)
Make an HTTP request to any URL.
Properties:
  - url (string) (REQUIRED): The URL to send the request to
  - method (string) [default: "GET"]: HTTP method. Options: GET, POST, PUT, DELETE, PATCH
  - headers (json): HTTP headers as a JSON object, e.g. {"Content-Type": "application/json"}
  - body (json): Request body (for POST/PUT/PATCH)
  - timeout (number) [default: 30000]: Timeout in milliseconds
Output: { statusCode, headers, body }

### code (action)
Execute custom JavaScript code. Has access to $input (previous node output), $inputs (all inputs), and can return any value.
Properties:
  - code (string) (REQUIRED): JavaScript code to execute. Use "return <value>" to output data. Has access to $input, $inputs, $node, $execution, console.
Output: { result, logs }

### set (action)
Set, append, or remove fields on the data object.
Properties:
  - values (json) (REQUIRED): Key-value pairs to set, e.g. {"status": "done", "count": 42}
  - mode (string) [default: "set"]: Options: set, append, remove
  - keepOnlySet (boolean) [default: false]: If true, discard fields not in values
Output: Modified data object

### if (logic)
Conditional branching. Routes data to output 0 (true) or output 1 (false) based on conditions.
Properties:
  - conditions (json) (REQUIRED): Array of conditions, e.g. [{"field": "statusCode", "operation": "equals", "value": 200}]. Operations: equals, notEquals, contains, gt, lt, gte, lte, isEmpty, isNotEmpty
  - combineOperation (string) [default: "AND"]: How to combine multiple conditions. Options: AND, OR
Output 0 (true): Input passes through if conditions match
Output 1 (false): Input passes through if conditions don't match

### switch (logic)
Multi-way branching based on a value.
Properties:
  - value (string) (REQUIRED): Dot-notation path to the value to switch on
  - cases (json) (REQUIRED): Array of cases, e.g. [{"value": "success", "label": "On success"}, {"value": "error", "label": "On error"}]
  - fallback (boolean) [default: false]: Include a fallback output if no case matches
Output: One output per case (+ fallback)

### merge (logic)
Merge multiple inputs into one.
Properties:
  - mode (string) [default: "append"]: Options: append (concat arrays), combine (deep merge objects), wait (wait for all)
Output: Merged data

`;
}

/**
 * Build the system prompt for the skill generation LLM call.
 */
function buildSystemPrompt(catalog: string): string {
  return `## Role
You are a workflow architect for an automation system.
Your job is to design a minimal, correct workflow from a natural language description.
Return ONLY valid JSON. No markdown, no prose, no explanation — just the JSON object.

## Available Nodes
${catalog}

## Expression Syntax
- Runtime inputs (from user at execution time): {{ $input.bridgeInputs.PARAM_NAME }}
- Upstream node output: {{ $node["NodeName"].FIELD_NAME }}
- Use expressions wherever a value should come from user input or a previous step.
- For document pipelines, data (rows) flows automatically between connected nodes — you do NOT need expressions for the rows array itself. Only use expressions for config properties like column names, thresholds, file paths, etc.
- For general workflows, use {{ $node["PreviousStepName"].FIELD }} to reference output from previous nodes.

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
      "param1": { "type": "string", "description": "Description of the parameter" }
    },
    "required": ["param1"]
  }
}

## Rules
1. Only use node types from the catalog above. Never invent new types.
2. For document processing: workflows that read a file MUST start with "read-excel" and workflows that produce a file MUST end with "write-excel".
3. For general automation: use "http-request", "code", "set", "if", "switch", "merge" as needed.
4. Parameters that come from the user at runtime MUST use {{ $input.bridgeInputs.X }} expressions in the config.
5. Include ALL runtime parameters in inputsSchema with proper types and descriptions.
6. Keep the pipeline minimal: only include nodes that are necessary.
7. Node "name" should be descriptive (e.g. "Fetch Google", not "http-request-1").
8. toolName must be snake_case, 3–50 characters, starting with a letter.
9. If the workflow needs no runtime parameters, inputsSchema.properties can be empty and required can be [].`;
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
 * Note: openclaw agent does not support --system, so we embed the system
 * prompt directly inside the message body.
 */
function callOpenClawForGeneration(
  agentId: string,
  systemPrompt: string,
  userMessage: string,
): Promise<{ content: string; error?: string }> {
  return new Promise((resolve) => {
    const combinedMessage = `${systemPrompt}\n\n---\n\n${userMessage}`;
    const sessionId = `skill-gen-${Date.now()}`;
    const args = ['agent', '--agent', agentId, '--session-id', sessionId, '-m', combinedMessage, '--json', '--timeout', '180'];

    console.log(`[skill-gen] Combined message: ${combinedMessage.length} chars`);

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

    // 3 minute timeout
    setTimeout(() => {
      proc.kill();
      resolve({ content: '', error: 'Generation timed out (180s)' });
    }, 180_000);
  });
}

/**
 * Extract a JSON object from free-form text (may include markdown fences, prose, etc.).
 */
function extractJsonFromText(text: string): Record<string, unknown> {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch { /* not direct JSON */ }

  // Strip ```json ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* fall through */ }
  }

  // Find first { to last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch { /* fall through */ }
  }

  throw new Error(`Could not parse JSON from text: ${text.slice(0, 200)}...`);
}

/**
 * Extract JSON from LLM response that may be wrapped in markdown fences or prose.
 */
function parseGenerationResponse(content: string): Record<string, unknown> {
  // Try parsing the --json structured output first
  try {
    const parsed = JSON.parse(content);

    // OpenClaw --json output: { result: { payloads: [{ text: "..." }] } }
    if (parsed.result?.payloads && Array.isArray(parsed.result.payloads)) {
      const text = parsed.result.payloads[0]?.text;
      if (typeof text === 'string') {
        console.log(`[skill-gen] Extracted text from OpenClaw payloads (${text.length} chars)`);
        return extractJsonFromText(text);
      }
    }

    // OpenClaw --json may wrap response in { content: "..." }
    if (parsed.content && typeof parsed.content === 'string') {
      return extractJsonFromText(parsed.content);
    }
    // If parsed object looks like our expected shape, return it
    if (parsed.workflowName || parsed.nodes) {
      return parsed;
    }
    // If it's some other wrapper, check for a text/message field
    const text = parsed.text || parsed.message || parsed.response || parsed.content;
    if (typeof text === 'string') {
      return extractJsonFromText(text);
    }
    return parsed;
  } catch {
    // Not direct JSON — try extracting from text
  }

  return extractJsonFromText(content);
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
  domainId?: string;
  agentId: string;
  domainSystemPrompt?: string;
  sampleData?: Record<string, unknown>[];
}

export async function generateWorkflowFromDescription(
  params: GenerateParams,
): Promise<SkillGenerationResult> {
  const { description, agentId, sampleData } = params;

  const coreNodeTypes = ['http-request', 'code', 'set', 'if', 'switch', 'merge'];
  const validNodeTypes = new Set([
    ...documentNodeManifests.map((m) => m.id),
    ...coreNodeTypes,
  ]);
  const catalog = buildNodeCatalogText(documentNodeManifests) + '\n' + buildCoreNodeCatalogText();
  const systemPrompt = buildSystemPrompt(catalog);
  const userMessage = buildUserMessage(description, sampleData);

  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = attempt === 0
      ? userMessage
      : `${userMessage}\n\nCORRECTION NEEDED: ${lastError}\nReturn ONLY valid JSON, no other text.`;

    console.log(`[skill-gen] Attempt ${attempt + 1}: calling OpenClaw CLI for agent ${agentId}`);
    console.log(`[skill-gen] Message length: ${msg.length} chars`);

    const result = await callOpenClawForGeneration(agentId, systemPrompt, msg);

    console.log(`[skill-gen] OpenClaw response length: ${result.content.length} chars`);
    console.log(`[skill-gen] OpenClaw response (first 500): ${result.content.slice(0, 500)}`);
    if (result.error) {
      console.warn(`[skill-gen] OpenClaw stderr: ${result.error.slice(0, 500)}`);
    }

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
