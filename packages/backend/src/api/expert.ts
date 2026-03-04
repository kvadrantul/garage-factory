// Expert API Routes
// CRUD operations for domains, scenarios, and cases

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';
import type { Domain, Scenario, Case } from '@garage-engine/shared';

export const expertRouter: RouterType = Router();

// ============================================
// DOMAINS
// ============================================

/**
 * GET /api/expert/domains
 * List all domains
 */
expertRouter.get('/domains', async (_req, res) => {
  try {
    const domains = await db
      .select()
      .from(schema.domains)
      .orderBy(desc(schema.domains.createdAt));

    res.json({ data: domains });
  } catch (error) {
    console.error('Error listing domains:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list domains' },
    });
  }
});

/**
 * GET /api/expert/domains/:id
 * Get domain by ID
 */
expertRouter.get('/domains/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, id))
      .get();

    if (!domain) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    // Get scenario count
    const scenarios = await db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.domainId, id));

    res.json({
      ...domain,
      scenarioCount: scenarios.length,
      enabledScenarioCount: scenarios.filter((s) => s.enabled).length,
    });
  } catch (error) {
    console.error('Error getting domain:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get domain' },
    });
  }
});

/**
 * POST /api/expert/domains
 * Create a new domain
 */
expertRouter.post('/domains', async (req, res) => {
  try {
    const { name, slug, description, icon, agentId, systemPrompt } = req.body as Partial<Domain>;

    if (!name || !slug) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'name and slug are required' },
      });
    }

    // Check slug uniqueness
    const existing = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.slug, slug))
      .get();

    if (existing) {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'Domain with this slug already exists' },
      });
    }

    const result = await db
      .insert(schema.domains)
      .values({
        name,
        slug,
        description,
        icon,
        agentId,
        systemPrompt,
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating domain:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create domain' },
    });
  }
});

/**
 * PUT /api/expert/domains/:id
 * Update a domain
 */
expertRouter.put('/domains/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, icon, agentId, systemPrompt } = req.body as Partial<Domain>;

    const existing = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Domain not found' },
      });
    }

    // Check slug uniqueness if changing
    if (slug && slug !== existing.slug) {
      const slugConflict = await db
        .select()
        .from(schema.domains)
        .where(eq(schema.domains.slug, slug))
        .get();

      if (slugConflict) {
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'Domain with this slug already exists' },
        });
      }
    }

    const result = await db
      .update(schema.domains)
      .set({
        name: name ?? existing.name,
        slug: slug ?? existing.slug,
        description: description ?? existing.description,
        icon: icon ?? existing.icon,
        agentId: agentId ?? existing.agentId,
        systemPrompt: systemPrompt ?? existing.systemPrompt,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, id))
      .returning();

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating domain:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update domain' },
    });
  }
});

/**
 * DELETE /api/expert/domains/:id
 * Delete a domain (cascades to scenarios and cases)
 */
expertRouter.delete('/domains/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(schema.domains).where(eq(schema.domains.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting domain:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete domain' },
    });
  }
});

// ============================================
// SCENARIOS
// ============================================

/**
 * GET /api/expert/scenarios
 * List scenarios (optionally filtered by domain_id)
 */
expertRouter.get('/scenarios', async (req, res) => {
  try {
    const domainId = req.query.domain_id as string | undefined;

    let query = db
      .select({
        scenario: schema.scenarios,
        workflowName: schema.workflows.name,
        domainName: schema.domains.name,
      })
      .from(schema.scenarios)
      .leftJoin(schema.workflows, eq(schema.scenarios.workflowId, schema.workflows.id))
      .leftJoin(schema.domains, eq(schema.scenarios.domainId, schema.domains.id))
      .orderBy(desc(schema.scenarios.createdAt));

    const results = await query;

    let filtered = results;
    if (domainId) {
      filtered = results.filter((r) => r.scenario.domainId === domainId);
    }

    res.json({
      data: filtered.map((r) => ({
        ...r.scenario,
        workflowName: r.workflowName,
        domainName: r.domainName,
      })),
    });
  } catch (error) {
    console.error('Error listing scenarios:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list scenarios' },
    });
  }
});

/**
 * GET /api/expert/scenarios/:id
 * Get scenario by ID
 */
expertRouter.get('/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .select({
        scenario: schema.scenarios,
        workflowName: schema.workflows.name,
        domainName: schema.domains.name,
      })
      .from(schema.scenarios)
      .leftJoin(schema.workflows, eq(schema.scenarios.workflowId, schema.workflows.id))
      .leftJoin(schema.domains, eq(schema.scenarios.domainId, schema.domains.id))
      .where(eq(schema.scenarios.id, id))
      .get();

    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scenario not found' },
      });
    }

    res.json({
      ...result.scenario,
      workflowName: result.workflowName,
      domainName: result.domainName,
    });
  } catch (error) {
    console.error('Error getting scenario:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get scenario' },
    });
  }
});

/**
 * POST /api/expert/scenarios
 * Create a new scenario
 */
expertRouter.post('/scenarios', async (req, res) => {
  try {
    const {
      workflowId,
      domainId,
      toolName,
      name,
      shortDescription,
      whenToApply,
      inputsSchema,
      outputsSchema,
      riskClass,
      estimatedDuration,
      enabled,
    } = req.body as Partial<Scenario>;

    if (!workflowId || !domainId || !toolName || !name || !shortDescription || !whenToApply) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'workflowId, domainId, toolName, name, shortDescription, and whenToApply are required',
        },
      });
    }

    // Verify workflow exists
    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, workflowId))
      .get();

    if (!workflow) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Workflow not found' },
      });
    }

    // Verify domain exists
    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, domainId))
      .get();

    if (!domain) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Domain not found' },
      });
    }

    // Check UNIQUE(domainId, toolName)
    const existing = await db
      .select()
      .from(schema.scenarios)
      .where(
        and(
          eq(schema.scenarios.domainId, domainId),
          eq(schema.scenarios.toolName, toolName),
        ),
      )
      .get();

    if (existing) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: `Tool '${toolName}' already exists in this domain`,
        },
      });
    }

    const result = await db
      .insert(schema.scenarios)
      .values({
        workflowId,
        domainId,
        toolName,
        name,
        shortDescription,
        whenToApply,
        inputsSchema: inputsSchema ? JSON.stringify(inputsSchema) : null,
        outputsSchema: outputsSchema ? JSON.stringify(outputsSchema) : null,
        riskClass: riskClass ?? 'read_only',
        estimatedDuration: estimatedDuration ?? 'fast',
        enabled: enabled ?? true,
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating scenario:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create scenario' },
    });
  }
});

/**
 * PUT /api/expert/scenarios/:id
 * Update a scenario
 */
expertRouter.put('/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body as Partial<Scenario>;

    const existing = await db
      .select()
      .from(schema.scenarios)
      .where(eq(schema.scenarios.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Scenario not found' },
      });
    }

    // Check UNIQUE(domainId, toolName) if changing toolName or domainId
    const newDomainId = updates.domainId ?? existing.domainId;
    const newToolName = updates.toolName ?? existing.toolName;

    if (newDomainId !== existing.domainId || newToolName !== existing.toolName) {
      const conflict = await db
        .select()
        .from(schema.scenarios)
        .where(
          and(
            eq(schema.scenarios.domainId, newDomainId),
            eq(schema.scenarios.toolName, newToolName),
          ),
        )
        .get();

      if (conflict && conflict.id !== id) {
        return res.status(409).json({
          error: {
            code: 'CONFLICT',
            message: `Tool '${newToolName}' already exists in this domain`,
          },
        });
      }
    }

    const result = await db
      .update(schema.scenarios)
      .set({
        workflowId: updates.workflowId ?? existing.workflowId,
        domainId: newDomainId,
        toolName: newToolName,
        name: updates.name ?? existing.name,
        shortDescription: updates.shortDescription ?? existing.shortDescription,
        whenToApply: updates.whenToApply ?? existing.whenToApply,
        inputsSchema: updates.inputsSchema ? JSON.stringify(updates.inputsSchema) : existing.inputsSchema,
        outputsSchema: updates.outputsSchema ? JSON.stringify(updates.outputsSchema) : existing.outputsSchema,
        riskClass: updates.riskClass ?? existing.riskClass,
        estimatedDuration: updates.estimatedDuration ?? existing.estimatedDuration,
        enabled: updates.enabled ?? existing.enabled,
        updatedAt: new Date(),
      })
      .where(eq(schema.scenarios.id, id))
      .returning();

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating scenario:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update scenario' },
    });
  }
});

/**
 * DELETE /api/expert/scenarios/:id
 * Delete a scenario
 */
expertRouter.delete('/scenarios/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(schema.scenarios).where(eq(schema.scenarios.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting scenario:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete scenario' },
    });
  }
});

// ============================================
// CASES
// ============================================

/**
 * GET /api/expert/cases
 * List cases (optionally filtered by domain_id or status)
 */
expertRouter.get('/cases', async (req, res) => {
  try {
    const domainId = req.query.domain_id as string | undefined;
    const status = req.query.status as string | undefined;

    const results = await db
      .select({
        case: schema.cases,
        domainName: schema.domains.name,
      })
      .from(schema.cases)
      .leftJoin(schema.domains, eq(schema.cases.domainId, schema.domains.id))
      .orderBy(desc(schema.cases.createdAt));

    let filtered = results;
    if (domainId) {
      filtered = filtered.filter((r) => r.case.domainId === domainId);
    }
    if (status) {
      filtered = filtered.filter((r) => r.case.status === status);
    }

    res.json({
      data: filtered.map((r) => ({
        ...r.case,
        domainName: r.domainName,
      })),
    });
  } catch (error) {
    console.error('Error listing cases:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list cases' },
    });
  }
});

/**
 * GET /api/expert/cases/:id
 * Get case by ID with steps
 */
expertRouter.get('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .select({
        case: schema.cases,
        domainName: schema.domains.name,
      })
      .from(schema.cases)
      .leftJoin(schema.domains, eq(schema.cases.domainId, schema.domains.id))
      .where(eq(schema.cases.id, id))
      .get();

    if (!result) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
    }

    // Get steps
    const steps = await db
      .select()
      .from(schema.caseSteps)
      .where(eq(schema.caseSteps.caseId, id));

    steps.sort((a, b) => a.stepIndex - b.stepIndex);

    res.json({
      ...result.case,
      domainName: result.domainName,
      steps,
    });
  } catch (error) {
    console.error('Error getting case:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get case' },
    });
  }
});

/**
 * POST /api/expert/cases
 * Create a new case
 */
expertRouter.post('/cases', async (req, res) => {
  try {
    const { domainId, title } = req.body as Partial<Case>;

    if (!domainId) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'domainId is required' },
      });
    }

    // Verify domain exists
    const domain = await db
      .select()
      .from(schema.domains)
      .where(eq(schema.domains.id, domainId))
      .get();

    if (!domain) {
      return res.status(400).json({
        error: { code: 'INVALID_REQUEST', message: 'Domain not found' },
      });
    }

    const result = await db
      .insert(schema.cases)
      .values({
        domainId,
        title: title ?? `New Case - ${new Date().toLocaleDateString()}`,
        status: 'open',
      })
      .returning();

    res.status(201).json(result[0]);
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create case' },
    });
  }
});

/**
 * PUT /api/expert/cases/:id
 * Update a case (title, status, summary)
 */
expertRouter.put('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, status, summary } = req.body as Partial<Case>;

    const existing = await db
      .select()
      .from(schema.cases)
      .where(eq(schema.cases.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Case not found' },
      });
    }

    const result = await db
      .update(schema.cases)
      .set({
        title: title ?? existing.title,
        status: status ?? existing.status,
        summary: summary ?? existing.summary,
        updatedAt: new Date(),
      })
      .where(eq(schema.cases.id, id))
      .returning();

    res.json(result[0]);
  } catch (error) {
    console.error('Error updating case:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to update case' },
    });
  }
});

/**
 * DELETE /api/expert/cases/:id
 * Delete a case (cascades to case_steps)
 */
expertRouter.delete('/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db.delete(schema.cases).where(eq(schema.cases.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting case:', error);
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete case' },
    });
  }
});
