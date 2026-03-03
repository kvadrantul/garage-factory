// Executions API Routes

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc, and } from 'drizzle-orm';

export const executionsRouter: RouterType = Router();

// List executions
executionsRouter.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const workflowId = req.query.workflowId as string;
    const status = req.query.status as string;

    let query = db
      .select({
        execution: schema.executions,
        workflowName: schema.workflows.name,
      })
      .from(schema.executions)
      .leftJoin(schema.workflows, eq(schema.executions.workflowId, schema.workflows.id))
      .orderBy(desc(schema.executions.createdAt))
      .limit(limit)
      .offset(offset);

    const results = await query;

    const data = results.map((r) => ({
      ...r.execution,
      workflowName: r.workflowName,
      duration: r.execution.finishedAt && r.execution.startedAt
        ? new Date(r.execution.finishedAt).getTime() - new Date(r.execution.startedAt).getTime()
        : null,
    }));

    res.json({
      data,
      total: data.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing executions:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list executions' } });
  }
});

// Get execution by ID
executionsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const execution = await db
      .select()
      .from(schema.executions)
      .where(eq(schema.executions.id, id))
      .get();

    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    // Get node execution data
    const nodes = await db
      .select()
      .from(schema.executionNodes)
      .where(eq(schema.executionNodes.executionId, id));

    const nodesMap: Record<string, any> = {};
    for (const node of nodes) {
      nodesMap[node.nodeId] = {
        status: node.status,
        startedAt: node.startedAt,
        finishedAt: node.finishedAt,
        input: node.inputData,
        output: node.outputData,
        error: node.error,
      };
    }

    res.json({
      ...execution,
      nodes: nodesMap,
    });
  } catch (error) {
    console.error('Error getting execution:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get execution' } });
  }
});

// Stop execution
executionsRouter.post('/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;

    const execution = await db
      .select()
      .from(schema.executions)
      .where(eq(schema.executions.id, id))
      .get();

    if (!execution) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'Execution already finished' } });
    }

    await db
      .update(schema.executions)
      .set({ status: 'stopped', finishedAt: new Date() })
      .where(eq(schema.executions.id, id));

    res.json({ id, status: 'stopped' });
  } catch (error) {
    console.error('Error stopping execution:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to stop execution' } });
  }
});

// Delete execution
executionsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await db
      .delete(schema.executions)
      .where(eq(schema.executions.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting execution:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete execution' } });
  }
});
