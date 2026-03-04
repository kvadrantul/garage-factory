// Chat Adapter - CLI-based integration with OpenClaw
// Spawns openclaw agent commands to communicate with agents

import { Router, type Router as RouterType } from 'express';
import { spawn } from 'child_process';
import { db, schema } from '../db/index.js';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const chatRouter: RouterType = Router();

interface AgentResponse {
  content: string;
  sessionId?: string;
  error?: string;
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
      timeout: 120000, // 2 minute timeout
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
        // Try to parse error from stderr
        const errorMatch = stderr.match(/Error: (.+)/);
        resolve({
          content: '',
          error: errorMatch ? errorMatch[1] : stderr || `Process exited with code ${code}`,
        });
        return;
      }

      try {
        // Try to parse JSON response from OpenClaw CLI
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          
          // Extract text from OpenClaw's nested response structure
          // Structure: { result: { payloads: [{ text: "..." }] }, ... }
          let content = '';
          let sessionId: string | undefined;
          
          if (json.result?.payloads?.[0]?.text) {
            content = json.result.payloads[0].text;
          } else if (json.content || json.message || json.text) {
            content = json.content || json.message || json.text;
          } else {
            content = stdout.trim();
          }
          
          // Extract session ID from meta
          if (json.result?.meta?.agentMeta?.sessionId) {
            sessionId = json.result.meta.agentMeta.sessionId;
          } else if (json.sessionId || json.session_id) {
            sessionId = json.sessionId || json.session_id;
          }
          
          resolve({ content, sessionId });
        } else {
          // Plain text response
          resolve({
            content: stdout.trim(),
          });
        }
      } catch {
        resolve({
          content: stdout.trim(),
        });
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
 * POST /api/chat/send
 * Send a message to OpenClaw agent and get response
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

    // Get domain for agent configuration
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

    // Get current step count for this case
    const stepCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, case_id))
      .get();
    const stepCount = stepCountResult?.count || 0;

    // Save user message as case_step
    const userStepId = nanoid(16);
    await db.insert(schema.caseSteps).values({
      id: userStepId,
      caseId: case_id,
      stepIndex: stepCount,
      type: 'user_message',
      content: JSON.stringify({ text: message }),
      createdAt: new Date(),
    });

    // Call OpenClaw agent via CLI
    const response = await callOpenClawAgent(
      domain.agentId,
      message,
      caseRecord.openclawSessionId ?? undefined,
    );

    if (response.error) {
      // Save error as case_step
      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: case_id,
        stepIndex: stepCount + 1,
        type: 'error',
        content: JSON.stringify({ error: response.error }),
        createdAt: new Date(),
      });
      return res.status(502).json({
        error: {
          code: 'AGENT_ERROR',
          message: response.error,
        },
      });
    }

    // Save assistant response as case_step
    const assistantStepId = nanoid(16);
    await db.insert(schema.caseSteps).values({
      id: assistantStepId,
      caseId: case_id,
      stepIndex: stepCount + 1,
      type: 'assistant_message',
      content: JSON.stringify({ text: response.content }),
      createdAt: new Date(),
    });

    // Update case with session ID if new
    if (!caseRecord.openclawSessionId && response.sessionId) {
      await db
        .update(schema.cases)
        .set({
          openclawSessionId: response.sessionId,
          updatedAt: new Date(),
        })
        .where(eq(schema.cases.id, case_id));
    }

    // Return response
    res.json({
      session_id: response.sessionId || caseRecord.openclawSessionId,
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

    // Sort by step index
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
