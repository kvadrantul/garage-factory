// Skills API — Generate, Save, Test endpoints for Phase B Skill Generation

import { Router, type Router as RouterType } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { generateWorkflowFromDescription } from '../services/skill-generator-llm.js';
import { generateSkill } from '../services/skill-generator.js';
import { executeWorkflowSync } from '../services/sync-executor.js';
import type { SkillSaveRequest } from '@garage-engine/shared';

export const skillsRouter: RouterType = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---------------------------------------------------------------------------
// POST /api/skills/generate
// ---------------------------------------------------------------------------
skillsRouter.post('/generate', upload.single('sampleFile'), async (req, res) => {
  try {
    const { description, domainId } = req.body as { description?: string; domainId?: string };

    if (!description || description.length < 10) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'description must be at least 10 characters' },
      });
    }
    if (!domainId) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'domainId is required' },
      });
    }

    // Fetch domain to get agentId
    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, domainId))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }
    if (!domain.agentId) {
      return res.status(400).json({
        error: { code: 'NO_AGENT', message: 'This domain has no AI agent. Configure one first.' },
      });
    }

    // Extract sample data from uploaded file if present
    let sampleData: Record<string, unknown>[] | undefined;
    if (req.file) {
      try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[];
        sampleData = rows.slice(0, 10);
      } catch (err) {
        console.warn('[skills] Failed to parse sample file, continuing without:', err);
      }
    }

    const result = await generateWorkflowFromDescription({
      description,
      domainId,
      agentId: domain.agentId,
      domainSystemPrompt: domain.systemPrompt ?? undefined,
      sampleData,
    });

    res.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[skills] Generate failed:', message);

    if (message.includes('timed out')) {
      return res.status(504).json({
        error: { code: 'TIMEOUT', message: 'AI took too long to respond. Try a simpler description.' },
      });
    }

    res.status(422).json({
      error: { code: 'GENERATION_FAILED', message },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/skills/save
// ---------------------------------------------------------------------------
skillsRouter.post('/save', async (req, res) => {
  try {
    const body = req.body as SkillSaveRequest;
    const { domainId, workflowDefinition, scenario: scenarioMeta } = body;

    if (!domainId || !workflowDefinition || !scenarioMeta?.toolName || !scenarioMeta?.name) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'domainId, workflowDefinition, and scenario metadata are required' },
      });
    }

    // Verify domain
    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, domainId))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    // Check toolName uniqueness
    const existing = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domainId),
          eq(schema.scenarios.toolName, scenarioMeta.toolName),
        ),
      )
      .get();

    if (existing) {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: `Tool '${scenarioMeta.toolName}' already exists in this domain` },
      });
    }

    // Create workflow
    const now = new Date();
    const workflow = await db
      .insert(schema.workflows)
      .values({
        name: `[Generated] ${scenarioMeta.name}`,
        definition: workflowDefinition,
        settings: workflowDefinition.settings ?? {},
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Create scenario
    const scenarioRow = await db
      .insert(schema.scenarios)
      .values({
        workflowId: workflow.id,
        domainId,
        toolName: scenarioMeta.toolName,
        name: scenarioMeta.name,
        shortDescription: scenarioMeta.shortDescription || scenarioMeta.name,
        whenToApply: scenarioMeta.whenToApply || `Use when the user asks about ${scenarioMeta.name}`,
        inputsSchema: scenarioMeta.inputsSchema ? JSON.stringify(scenarioMeta.inputsSchema) : null,
        riskClass: (scenarioMeta.riskClass as any) ?? 'read_only',
        estimatedDuration: (scenarioMeta.estimatedDuration as any) ?? 'fast',
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    // Generate SKILL.md
    if (domain.agentId) {
      try {
        await generateSkill(domain.agentId, {
          toolName: scenarioMeta.toolName,
          name: scenarioMeta.name,
          shortDescription: scenarioMeta.shortDescription || scenarioMeta.name,
          whenToApply: scenarioMeta.whenToApply || '',
          inputsSchema: scenarioMeta.inputsSchema,
        });
      } catch (err) {
        console.warn('[skills] SKILL.md generation failed:', err);
      }
    }

    console.log(`[skills] Saved skill "${scenarioMeta.toolName}": workflow=${workflow.id}, scenario=${scenarioRow.id}`);

    res.status(201).json({
      data: {
        workflow,
        scenario: scenarioRow,
      },
    });
  } catch (error) {
    console.error('[skills] Save failed:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to save skill' },
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/skills/test
// ---------------------------------------------------------------------------
skillsRouter.post('/test', async (req, res) => {
  try {
    const { workflowId, sampleFilePath } = req.body as {
      workflowId?: string;
      sampleFilePath?: string;
    };

    if (!workflowId) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'workflowId is required' },
      });
    }

    if (!sampleFilePath) {
      return res.json({
        data: { status: 'skipped', outputSummary: 'No sample file provided' },
      });
    }

    const triggerData = {
      bridgeInputs: { filePath: sampleFilePath },
    };

    const result = await executeWorkflowSync(workflowId, 'manual', triggerData, 60_000);

    if (result.status === 'completed') {
      const outputs = result.outputs ?? {};
      const rowCount = (outputs.totalRows ?? outputs.rowCount ?? outputs.groupCount) as number | undefined;

      res.json({
        data: {
          status: 'completed',
          rowsProcessed: rowCount,
          outputSummary: rowCount != null
            ? `Processed ${rowCount} rows successfully`
            : 'Workflow completed successfully',
        },
      });
    } else {
      res.json({
        data: {
          status: 'failed',
          outputSummary: 'Workflow execution failed',
          error: result.error || `Status: ${result.status}`,
        },
      });
    }
  } catch (error) {
    console.error('[skills] Test failed:', error);
    res.json({
      data: {
        status: 'failed' as const,
        outputSummary: 'Test execution error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});
