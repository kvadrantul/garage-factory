// Chat Adapter - CLI-based integration with OpenClaw
// Spawns openclaw agent commands to communicate with agents
// Implements tool-calling loop: agent -> detect tool call -> execute via bridge -> feed result back

import { Router, type Router as RouterType } from 'express';
import { spawn } from 'child_process';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { executeWorkflowSync } from '../services/sync-executor.js';
import { createArtifact, buildArtifactContext, findArtifactByName, inferMimeType } from '../services/artifact-service.js';

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const caseId = req.body.case_id;
    if (!caseId) {
      return cb(new Error('case_id is required'), '');
    }
    const dir = path.join(process.cwd(), 'uploads', caseId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[/\\]/g, '_');
    const name = `${Date.now()}-${safe}`;
    cb(null, name);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

export const chatRouter: RouterType = Router();

interface AgentResponse {
  content: string;
  sessionId?: string;
  error?: string;
}

interface ToolCall {
  tool_name: string;
  inputs: Record<string, unknown>;
}

/**
 * Spawn openclaw agent command and get response
 */
async function callOpenClawAgent(
  agentId: string,
  message: string,
  sessionId?: string,
): Promise<AgentResponse> {
  return new Promise((resolve) => {
    const args = ['agent', '--agent', agentId, '--message', message, '--json'];
    
    if (sessionId) {
      args.push('--session-id', sessionId);
    }

    const proc = spawn('openclaw', args, {
      env: { ...process.env },
      timeout: 120000,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const errorMatch = stderr.match(/Error: (.+)/);
        resolve({
          content: '',
          error: errorMatch ? errorMatch[1] : stderr || `Process exited with code ${code}`,
        });
        return;
      }

      try {
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          
          let content = '';
          let sessionId: string | undefined;
          
          if (json.result?.payloads?.[0]?.text) {
            content = json.result.payloads[0].text;
          } else if (json.content || json.message || json.text) {
            content = json.content || json.message || json.text;
          } else {
            content = stdout.trim();
          }
          
          if (json.result?.meta?.agentMeta?.sessionId) {
            sessionId = json.result.meta.agentMeta.sessionId;
          } else if (json.sessionId || json.session_id) {
            sessionId = json.sessionId || json.session_id;
          }
          
          resolve({ content, sessionId });
        } else {
          resolve({ content: stdout.trim() });
        }
      } catch {
        resolve({ content: stdout.trim() });
      }
    });

    proc.on('error', (err) => {
      resolve({
        content: '',
        error: `Failed to spawn openclaw: ${err.message}`,
      });
    });
  });
}

/**
 * Try to parse a tool call from agent response.
 * Agent is instructed to respond with JSON like:
 * {"tool_call": {"tool_name": "...", "inputs": {...}}}
 */
function parseToolCall(content: string): ToolCall | null {
  // Look for JSON block in the response
  const jsonPatterns = [
    /```json\s*\n?([\s\S]*?)\n?```/,
    /\{"tool_call"\s*:\s*\{[\s\S]*?\}\s*\}/,
  ];

  for (const pattern of jsonPatterns) {
    const match = content.match(pattern);
    if (match) {
      try {
        const parsed = JSON.parse(match[1] || match[0]);
        if (parsed.tool_call?.tool_name) {
          return {
            tool_name: parsed.tool_call.tool_name,
            inputs: parsed.tool_call.inputs || {},
          };
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Build tool context string for the agent, describing available tools and how to call them.
 */
async function buildToolContext(
  scenarios: Array<{ toolName: string; name: string; shortDescription: string; inputsSchema: unknown }>,
  domainId: string,
  caseId: string,
): Promise<string> {
  let ctx = '';

  // Add artifact context (available case files)
  const artifactCtx = await buildArtifactContext(caseId);
  if (artifactCtx) {
    ctx += '\n\n' + artifactCtx;
  }

  if (scenarios.length === 0) return ctx;

  ctx += '\n\n## Available Tools\n\n';
  ctx += 'When you need to use a tool, respond with ONLY a JSON block like this:\n';
  ctx += '```json\n{"tool_call": {"tool_name": "<name>", "inputs": {<params>}}}\n```\n\n';
  ctx += 'Do NOT add any text before or after the JSON block when calling a tool.\n';
  ctx += 'After I execute the tool, I will send you the result and you can then respond to the user.\n\n';
  ctx += `Context: domain_id="${domainId}", case_id="${caseId}"\n\n`;

  for (const s of scenarios) {
    ctx += `### ${s.name} (tool_name: "${s.toolName}")\n`;
    ctx += `${s.shortDescription}\n`;
    if (s.inputsSchema) {
      const schema = typeof s.inputsSchema === 'string' ? JSON.parse(s.inputsSchema) : s.inputsSchema;
      const props = schema.properties;
      if (props) {
        ctx += 'Parameters:\n';
        for (const [key, val] of Object.entries(props as Record<string, { type?: string; description?: string }>)) {
          ctx += `  - ${key} (${val.type || 'string'}): ${val.description || key}\n`;
        }
      }
    }
    ctx += '\n';
  }

  return ctx;
}

/**
 * POST /api/chat/send
 * Send a message to OpenClaw agent and get response.
 * Implements tool-calling loop.
 */
chatRouter.post('/send', async (req, res) => {
  try {
    const { case_id, message } = req.body as {
      case_id: string;
      message: string;
    };

    if (!case_id || !message) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'case_id and message are required' },
      });
    }

    // Get case with domain info
    const caseRecord = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, case_id))
      .get();

    if (!caseRecord) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
    }

    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, caseRecord.domainId))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    if (!domain.agentId) {
      return res.status(400).json({
        error: { code: 'NO_AGENT', message: 'Domain has no agent configured' },
      });
    }

    // Load available scenarios for tool context
    const scenarios = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domain.id),
          eq(schema.scenarios.enabled, true),
        ),
      );

    // Get current step count
    const stepCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, case_id))
      .get();
    let stepIndex = stepCountResult?.count || 0;

    // Save user message
    await db.insert(schema.caseSteps).values({
      id: nanoid(16),
      caseId: case_id,
      stepIndex: stepIndex++,
      type: 'user_message',
      content: JSON.stringify({ text: message }),
      createdAt: new Date(),
    });

    // Build message with tool context
    const toolContext = await buildToolContext(scenarios, domain.id, case_id);
    const enrichedMessage = toolContext ? `${message}\n${toolContext}` : message;

    // Call agent
    let response = await callOpenClawAgent(
      domain.agentId,
      enrichedMessage,
      caseRecord.openclawSessionId ?? undefined,
    );

    if (response.error) {
      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: case_id,
        stepIndex: stepIndex++,
        type: 'error',
        content: JSON.stringify({ error: response.error }),
        createdAt: new Date(),
      });
      return res.status(502).json({
        error: { code: 'AGENT_ERROR', message: response.error },
      });
    }

    // Update session ID
    if (!caseRecord.openclawSessionId && response.sessionId) {
      await db
        .update(schema.cases)
        .set({ openclawSessionId: response.sessionId, updatedAt: new Date() })
        .where(eq(schema.cases.id, case_id));
    }
    const sessionId = response.sessionId || caseRecord.openclawSessionId;

    // Tool-calling loop (max 3 iterations to prevent infinite loops)
    for (let i = 0; i < 3; i++) {
      const toolCall = parseToolCall(response.content);
      if (!toolCall) break;

      // Find matching scenario
      const scenario = scenarios.find((s) => s.toolName === toolCall.tool_name);
      if (!scenario) {
        // Tool not found - tell agent
        response = await callOpenClawAgent(
          domain.agentId,
          `Tool "${toolCall.tool_name}" not found. Available tools: ${scenarios.map((s) => s.toolName).join(', ')}`,
          sessionId ?? undefined,
        );
        continue;
      }

      // Log tool_call step
      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: case_id,
        stepIndex: stepIndex++,
        type: 'tool_call',
        content: JSON.stringify({ toolName: toolCall.tool_name, inputs: toolCall.inputs, scenarioId: scenario.id }),
        scenarioId: scenario.id,
        createdAt: new Date(),
      });

      // Resolve artifact names in inputs to actual file paths
      const resolvedInputs = { ...toolCall.inputs };
      for (const [key, value] of Object.entries(resolvedInputs)) {
        if (typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.startsWith('uploads/') && !value.startsWith('artifacts/')) {
          const artifact = findArtifactByName(case_id, value);
          if (artifact) {
            resolvedInputs[key] = artifact.filePath;
          }
        }
      }

      // Execute workflow via sync executor
      let toolResultMessage: string;
      try {
        const result = await executeWorkflowSync(
          scenario.workflowId,
          'manual',
          { bridgeInputs: resolvedInputs, caseId: case_id, scenarioId: scenario.id },
        );

        // Log tool_result step
        const toolResultStepId = nanoid(16);
        await db.insert(schema.caseSteps).values({
          id: toolResultStepId,
          caseId: case_id,
          stepIndex: stepIndex++,
          type: 'tool_result',
          content: JSON.stringify({ executionId: result.executionId, status: result.status, outputs: result.outputs, error: result.error }),
          executionId: result.executionId,
          scenarioId: scenario.id,
          createdAt: new Date(),
        });

        // Detect file outputs and create artifacts
        if (result.status === 'completed' && result.outputs) {
          const filePath = result.outputs.filePath as string | undefined;
          if (filePath && typeof filePath === 'string') {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            if (fs.existsSync(absolutePath)) {
              try {
                const stat = fs.statSync(absolutePath);
                const metadata: Record<string, unknown> = {};
                if (result.outputs.rowCount != null) metadata.rowCount = result.outputs.rowCount;
                await createArtifact({
                  caseId: case_id,
                  name: path.basename(filePath),
                  filePath,
                  mimeType: inferMimeType(filePath),
                  size: stat.size,
                  sourceType: 'skill_output',
                  sourceStepId: toolResultStepId,
                  metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                });
              } catch (err) {
                console.error('Failed to create artifact from chat tool result:', err);
              }
            }
          }
        }

        if (result.status === 'completed') {
          toolResultMessage = `Tool "${toolCall.tool_name}" result:\n${JSON.stringify(result.outputs, null, 2)}\n\nNow format this result nicely for the user. Do NOT output a tool_call JSON.`;
        } else if (result.status === 'failed') {
          toolResultMessage = `Tool "${toolCall.tool_name}" failed: ${result.error}`;
        } else {
          toolResultMessage = `Tool "${toolCall.tool_name}" status: ${result.status}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResultMessage = `Tool "${toolCall.tool_name}" execution error: ${msg}`;
      }

      // Send tool result back to agent
      response = await callOpenClawAgent(
        domain.agentId,
        toolResultMessage,
        sessionId ?? undefined,
      );

      if (response.error) break;
    }

    // Save final assistant response
    await db.insert(schema.caseSteps).values({
      id: nanoid(16),
      caseId: case_id,
      stepIndex: stepIndex++,
      type: 'assistant_message',
      content: JSON.stringify({ text: response.content }),
      createdAt: new Date(),
    });

    res.json({
      session_id: sessionId,
      message: {
        role: 'assistant',
        content: response.content,
      },
      finish_reason: 'stop',
    });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to send message' },
    });
  }
});

/**
 * POST /api/chat/upload
 * Upload files (optionally with a message) to a case.
 * If message is provided, runs the agent loop as /send does.
 * If only files, creates file_upload step and returns.
 */
chatRouter.post('/upload', upload.array('files', 10), async (req, res) => {
  try {
    const { case_id, message } = req.body as {
      case_id: string;
      message?: string;
    };
    const files = req.files as Express.Multer.File[] | undefined;

    if (!case_id) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'case_id is required' },
      });
    }

    if ((!files || files.length === 0) && !message?.trim()) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'At least one file or a message is required' },
      });
    }

    // Get case with domain info
    const caseRecord = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, case_id))
      .get();

    if (!caseRecord) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
    }

    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, caseRecord.domainId))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    // Get current step count
    const stepCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, case_id))
      .get();
    let stepIndex = stepCountResult?.count || 0;

    // Save file_upload step if files were uploaded
    if (files && files.length > 0) {
      const fileData = files.map((f) => ({
        name: f.filename,
        originalName: f.originalname,
        size: f.size,
        mimeType: f.mimetype,
        path: `uploads/${case_id}/${f.filename}`,
      }));

      const uploadStepId = nanoid(16);
      await db.insert(schema.caseSteps).values({
        id: uploadStepId,
        caseId: case_id,
        stepIndex: stepIndex++,
        type: 'file_upload',
        content: JSON.stringify({ files: fileData }),
        createdAt: new Date(),
      });

      // Create artifacts for uploaded files
      for (const f of fileData) {
        try {
          await createArtifact({
            caseId: case_id,
            name: f.originalName,
            filePath: f.path,
            mimeType: f.mimeType,
            size: f.size,
            sourceType: 'upload',
            sourceStepId: uploadStepId,
          });
        } catch (err) {
          console.error('Failed to create artifact for upload:', err);
        }
      }
    }

    // If no message, return upload-only response
    if (!message?.trim()) {
      return res.json({ upload_only: true });
    }

    // --- From here, same logic as /send ---

    if (!domain.agentId) {
      return res.status(400).json({
        error: { code: 'NO_AGENT', message: 'Domain has no agent configured' },
      });
    }

    // Load available scenarios for tool context
    const scenarios = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domain.id),
          eq(schema.scenarios.enabled, true),
        ),
      );

    // Save user message
    await db.insert(schema.caseSteps).values({
      id: nanoid(16),
      caseId: case_id,
      stepIndex: stepIndex++,
      type: 'user_message',
      content: JSON.stringify({ text: message.trim() }),
      createdAt: new Date(),
    });

    // Build message with tool context
    const toolContext = await buildToolContext(scenarios, domain.id, case_id);
    const enrichedMessage = toolContext ? `${message.trim()}\n${toolContext}` : message.trim();

    // Call agent
    let response = await callOpenClawAgent(
      domain.agentId,
      enrichedMessage,
      caseRecord.openclawSessionId ?? undefined,
    );

    if (response.error) {
      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: case_id,
        stepIndex: stepIndex++,
        type: 'error',
        content: JSON.stringify({ error: response.error }),
        createdAt: new Date(),
      });
      return res.status(502).json({
        error: { code: 'AGENT_ERROR', message: response.error },
      });
    }

    // Update session ID
    if (!caseRecord.openclawSessionId && response.sessionId) {
      await db
        .update(schema.cases)
        .set({ openclawSessionId: response.sessionId, updatedAt: new Date() })
        .where(eq(schema.cases.id, case_id));
    }
    const sessionId = response.sessionId || caseRecord.openclawSessionId;

    // Tool-calling loop (max 3 iterations)
    for (let i = 0; i < 3; i++) {
      const toolCall = parseToolCall(response.content);
      if (!toolCall) break;

      const scenario = scenarios.find((s) => s.toolName === toolCall.tool_name);
      if (!scenario) {
        response = await callOpenClawAgent(
          domain.agentId,
          `Tool "${toolCall.tool_name}" not found. Available tools: ${scenarios.map((s) => s.toolName).join(', ')}`,
          sessionId ?? undefined,
        );
        continue;
      }

      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: case_id,
        stepIndex: stepIndex++,
        type: 'tool_call',
        content: JSON.stringify({ toolName: toolCall.tool_name, inputs: toolCall.inputs, scenarioId: scenario.id }),
        scenarioId: scenario.id,
        createdAt: new Date(),
      });

      // Resolve artifact names in inputs to actual file paths
      const resolvedInputs = { ...toolCall.inputs };
      for (const [key, value] of Object.entries(resolvedInputs)) {
        if (typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.startsWith('uploads/') && !value.startsWith('artifacts/')) {
          const artifact = findArtifactByName(case_id, value);
          if (artifact) {
            resolvedInputs[key] = artifact.filePath;
          }
        }
      }

      let toolResultMessage: string;
      try {
        const result = await executeWorkflowSync(
          scenario.workflowId,
          'manual',
          { bridgeInputs: resolvedInputs, caseId: case_id, scenarioId: scenario.id },
        );

        const toolResultStepId = nanoid(16);
        await db.insert(schema.caseSteps).values({
          id: toolResultStepId,
          caseId: case_id,
          stepIndex: stepIndex++,
          type: 'tool_result',
          content: JSON.stringify({ executionId: result.executionId, status: result.status, outputs: result.outputs, error: result.error }),
          executionId: result.executionId,
          scenarioId: scenario.id,
          createdAt: new Date(),
        });

        // Detect file outputs and create artifacts
        if (result.status === 'completed' && result.outputs) {
          const filePath = result.outputs.filePath as string | undefined;
          if (filePath && typeof filePath === 'string') {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
            if (fs.existsSync(absolutePath)) {
              try {
                const stat = fs.statSync(absolutePath);
                const metadata: Record<string, unknown> = {};
                if (result.outputs.rowCount != null) metadata.rowCount = result.outputs.rowCount;
                await createArtifact({
                  caseId: case_id,
                  name: path.basename(filePath),
                  filePath,
                  mimeType: inferMimeType(filePath),
                  size: stat.size,
                  sourceType: 'skill_output',
                  sourceStepId: toolResultStepId,
                  metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
                });
              } catch (err) {
                console.error('Failed to create artifact from upload tool result:', err);
              }
            }
          }
        }

        if (result.status === 'completed') {
          toolResultMessage = `Tool "${toolCall.tool_name}" result:\n${JSON.stringify(result.outputs, null, 2)}\n\nNow format this result nicely for the user. Do NOT output a tool_call JSON.`;
        } else if (result.status === 'failed') {
          toolResultMessage = `Tool "${toolCall.tool_name}" failed: ${result.error}`;
        } else {
          toolResultMessage = `Tool "${toolCall.tool_name}" status: ${result.status}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolResultMessage = `Tool "${toolCall.tool_name}" execution error: ${msg}`;
      }

      response = await callOpenClawAgent(
        domain.agentId,
        toolResultMessage,
        sessionId ?? undefined,
      );

      if (response.error) break;
    }

    // Save final assistant response
    await db.insert(schema.caseSteps).values({
      id: nanoid(16),
      caseId: case_id,
      stepIndex: stepIndex++,
      type: 'assistant_message',
      content: JSON.stringify({ text: response.content }),
      createdAt: new Date(),
    });

    res.json({
      session_id: sessionId,
      message: {
        role: 'assistant',
        content: response.content,
      },
      finish_reason: 'stop',
    });
  } catch (error) {
    console.error('Error uploading files:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to upload files' },
    });
  }
});

/**
 * GET /api/chat/history/:case_id
 * Get chat history for a case (from case_steps)
 */
chatRouter.get('/history/:case_id', async (req, res) => {
  try {
    const { case_id } = req.params;

    const steps = await db
      .select()
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, case_id));

    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    // Enrich hitl_request steps with HITL details from hitlRequests table
    const enrichedSteps = await Promise.all(
      steps.map(async (s) => {
        const base = {
          id: s.id,
          step_index: s.stepIndex,
          type: s.type,
          content: s.content,
          created_at: s.createdAt,
        };

        if (s.type === 'hitl_request') {
          try {
            const content = typeof s.content === 'string' ? JSON.parse(s.content) : s.content;
            if (content.hitlRequestId) {
              const hitlRequest = await db
                .select()
                .from(schema.hitlRequests)
                .where(eq(schema.hitlRequests.id, content.hitlRequestId))
                .get();

              if (hitlRequest) {
                const requestData = typeof hitlRequest.requestData === 'string'
                  ? JSON.parse(hitlRequest.requestData)
                  : hitlRequest.requestData;

                return {
                  ...base,
                  hitl_details: {
                    hitl_id: hitlRequest.id,
                    type: hitlRequest.type,
                    status: hitlRequest.status,
                    message: requestData?.message,
                    details: requestData?.details,
                    fields: requestData?.fields,
                    options: requestData?.options,
                  },
                };
              }
            }
          } catch {
            // If parsing fails, return base step
          }
        }

        return base;
      }),
    );

    res.json({
      case_id,
      steps: enrichedSteps,
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch history' },
    });
  }
});
