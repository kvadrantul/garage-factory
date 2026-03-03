// Workflows API Routes

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';
import type { WorkflowDefinition, WorkflowSettings } from '@orchestrator/shared';

export const workflowsRouter: RouterType = Router();

// List all workflows
workflowsRouter.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const results = await db
      .select()
      .from(schema.workflows)
      .orderBy(desc(schema.workflows.updatedAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select()
      .from(schema.workflows);

    res.json({
      data: results,
      total: total.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing workflows:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list workflows' } });
  }
});

// Get workflow by ID
workflowsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, id))
      .get();

    if (!workflow) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    res.json(workflow);
  } catch (error) {
    console.error('Error getting workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow' } });
  }
});

// Create workflow
workflowsRouter.post('/', async (req, res) => {
  try {
    const { name, description, definition, settings } = req.body as {
      name: string;
      description?: string;
      definition: WorkflowDefinition;
      settings?: WorkflowSettings;
    };

    if (!name || !definition) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'name and definition are required' },
      });
    }

    const now = new Date();
    const result = await db
      .insert(schema.workflows)
      .values({
        name,
        description,
        definition,
        settings,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow' } });
  }
});

// Update workflow
workflowsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, definition, settings, active } = req.body;

    const existing = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const result = await db
      .update(schema.workflows)
      .set({
        name: name ?? existing.name,
        description: description ?? existing.description,
        definition: definition ?? existing.definition,
        settings: settings ?? existing.settings,
        active: active ?? existing.active,
        updatedAt: new Date(),
      })
      .where(eq(schema.workflows.id, id))
      .returning()
      .get();

    res.json(result);
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update workflow' } });
  }
});

// Delete workflow
workflowsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db
      .delete(schema.workflows)
      .where(eq(schema.workflows.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete workflow' } });
  }
});

// Execute workflow (manual trigger)
workflowsRouter.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { triggerData } = req.body;

    const workflow = await db
      .select()
      .from(schema.workflows)
      .where(eq(schema.workflows.id, id))
      .get();

    if (!workflow) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    // Create execution record
    const now = new Date();
    const execution = await db
      .insert(schema.executions)
      .values({
        workflowId: id,
        status: 'running',
        triggerType: 'manual',
        triggerData,
        startedAt: now,
        createdAt: now,
      })
      .returning()
      .get();

    // TODO: Actually execute the workflow via ExecutionRunner
    // For now, just mark as completed
    await db
      .update(schema.executions)
      .set({ status: 'completed', finishedAt: new Date() })
      .where(eq(schema.executions.id, execution.id));

    res.json({ executionId: execution.id, status: 'running' });
  } catch (error) {
    console.error('Error executing workflow:', error);
    res.status(500).json({ error: { code: 'EXECUTION_FAILED', message: 'Failed to execute workflow' } });
  }
});

// Activate workflow
workflowsRouter.post('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .update(schema.workflows)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(schema.workflows.id, id))
      .returning()
      .get();

    if (!result) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    res.json(result);
  } catch (error) {
    console.error('Error activating workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to activate workflow' } });
  }
});

// Deactivate workflow
workflowsRouter.post('/:id/deactivate', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db
      .update(schema.workflows)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(schema.workflows.id, id))
      .returning()
      .get();

    if (!result) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    res.json(result);
  } catch (error) {
    console.error('Error deactivating workflow:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to deactivate workflow' } });
  }
});
