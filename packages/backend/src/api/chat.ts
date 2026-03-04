// Chat Adapter - CLI-based integration with OpenClaw
// Spawns openclaw agent commands to communicate with agents
// Implements tool-calling loop: agent -> detect tool call -> execute via bridge -> feed result back

import { Router, type Router as RouterType } from 'express';
import { spawn } from 'child_process';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { executeWorkflowSync } from '../services/sync-executor.js';

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
function buildToolContext(
  scenarios: Array<{ toolName: string; name: string; shortDescription: string; inputsSchema: unknown }>,
  domainId: string,
  caseId: string,
): string {
  if (scenarios.length === 0) return '';

  let ctx = '\n\n## Available Tools\n\n';
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
    const toolContext = buildToolContext(scenarios, domain.id, case_id);
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

      // Execute workflow via sync executor
      let toolResultMessage: string;
      try {
        const result = await executeWorkflowSync(
          scenario.workflowId,
          'manual',
          { bridgeInputs: toolCall.inputs, caseId: case_id, scenarioId: scenario.id },
        );

        // Log tool_result step
        await db.insert(schema.caseSteps).values({
          id: nanoid(16),
          caseId: case_id,
          stepIndex: stepIndex++,
          type: 'tool_result',
          content: JSON.stringify({ executionId: result.executionId, status: result.status, outputs: result.outputs, error: result.error }),
          executionId: result.executionId,
          scenarioId: scenario.id,
          createdAt: new Date(),
        });

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

    res.json({
      case_id,
      steps: steps.map((s) => ({
        id: s.id,
        step_index: s.stepIndex,
        type: s.type,
        content: s.content,
        created_at: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch history' },
    });
  }
});
