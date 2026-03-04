// Skills Chat API — Chat-based skill generation with ephemeral in-memory sessions

import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { nanoid } from 'nanoid';
import { db, schema } from '../db/index.js';
import { isNotNull } from 'drizzle-orm';
import { generateWorkflowFromDescription } from '../services/skill-generator-llm.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatStep {
  id: string;
  type: 'user_message' | 'assistant_message' | 'skill_generated';
  content: unknown;
  createdAt: string;
}

interface Session {
  id: string;
  agentId: string;
  steps: ChatStep[];
  createdAt: number;
}

// ---------------------------------------------------------------------------
// In-memory session store with 2-hour TTL
// ---------------------------------------------------------------------------

const sessions = new Map<string, Session>();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 10 * 60 * 1000); // cleanup every 10 minutes

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const skillsChatRouter: RouterType = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/skills/chat/start
skillsChatRouter.post('/start', async (_req, res) => {
  try {
    // Resolve agent: env var first, then fallback to first domain with an agent
    let agentId = process.env.SKILL_GEN_AGENT_ID;

    if (!agentId) {
      const domainWithAgent = await db
        .select({ agentId: schema.domains.agentId })
        .from(schema.domains)
        .where(isNotNull(schema.domains.agentId))
        .limit(1)
        .get();

      agentId = domainWithAgent?.agentId ?? undefined;
    }

    if (!agentId) {
      return res.status(400).json({
        error: {
          code: 'NO_AGENT',
          message: 'No agent configured for skill generation. Set SKILL_GEN_AGENT_ID environment variable or configure a domain with an agent.',
        },
      });
    }

    const sessionId = nanoid(16);
    const welcomeStep: ChatStep = {
      id: nanoid(8),
      type: 'assistant_message',
      content: {
        text: 'Hi! I can help you create a new workflow. Describe what you need — for example: "Read an Excel bank statement, filter transactions above 1,000,000, group by counterparty BIK, and write a summary file." You can also attach a sample Excel file to help me understand the data structure.',
      },
      createdAt: new Date().toISOString(),
    };

    const session: Session = {
      id: sessionId,
      agentId,
      steps: [welcomeStep],
      createdAt: Date.now(),
    };

    sessions.set(sessionId, session);

    res.json({ sessionId, steps: session.steps });
  } catch (error) {
    console.error('[skills-chat] Start failed:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to start chat session' },
    });
  }
});

// POST /api/skills/chat/send
skillsChatRouter.post('/send', upload.single('sampleFile'), async (req, res) => {
  try {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };

    if (!sessionId || !message) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'sessionId and message are required' },
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        error: { code: 'SESSION_NOT_FOUND', message: 'Chat session expired or not found. Please start a new one.' },
      });
    }

    // Add user message step
    const userStep: ChatStep = {
      id: nanoid(8),
      type: 'user_message',
      content: { text: message },
      createdAt: new Date().toISOString(),
    };
    session.steps.push(userStep);

    // Parse sample file if present
    let sampleData: Record<string, unknown>[] | undefined;
    if (req.file) {
      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[];
        sampleData = rows.slice(0, 10);
      } catch (err) {
        console.warn('[skills-chat] Failed to parse sample file, continuing without:', err);
      }
    }

    // Call skill generation
    try {
      const result = await generateWorkflowFromDescription({
        description: message,
        agentId: session.agentId,
        sampleData,
      });

      const generatedStep: ChatStep = {
        id: nanoid(8),
        type: 'skill_generated',
        content: {
          workflowDefinition: result.workflowDefinition,
          scenario: result.scenario,
          generationLog: result.generationLog,
        },
        createdAt: new Date().toISOString(),
      };
      session.steps.push(generatedStep);

      res.json({ steps: [userStep, generatedStep] });
    } catch (genError) {
      const errorMessage = genError instanceof Error ? genError.message : 'Generation failed';
      console.error('[skills-chat] Generation failed:', errorMessage);

      const errorStep: ChatStep = {
        id: nanoid(8),
        type: 'assistant_message',
        content: {
          text: `I wasn't able to generate a skill from that description. ${errorMessage.includes('timed out') ? 'The AI took too long to respond — try a simpler description.' : 'Please try rephrasing your description or providing more detail.'}`,
        },
        createdAt: new Date().toISOString(),
      };
      session.steps.push(errorStep);

      res.json({ steps: [userStep, errorStep] });
    }
  } catch (error) {
    console.error('[skills-chat] Send failed:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to process message' },
    });
  }
});

// GET /api/skills/chat/history/:sessionId
skillsChatRouter.get('/history/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({
      error: { code: 'SESSION_NOT_FOUND', message: 'Chat session expired or not found.' },
    });
  }
  res.json({ steps: session.steps });
});
