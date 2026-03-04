// HITL API Routes

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const hitlRouter: RouterType = Router();

// Get pending HITL requests
hitlRouter.get('/', async (req, res) => {
  try {
    const executionId = req.query.executionId as string;
    const status = (req.query.status as string) || 'pending';

    let conditions = [eq(schema.hitlRequests.status, status as any)];
    
    if (executionId) {
      conditions.push(eq(schema.hitlRequests.executionId, executionId));
    }

    const results = await db
      .select()
      .from(schema.hitlRequests)
      .where(and(...conditions));

    res.json({ data: results });
  } catch (error) {
    console.error('Error listing HITL requests:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list HITL requests' } });
  }
});

// Respond to HITL request
hitlRouter.post('/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { action, data, reason } = req.body;

    const hitl = await db
      .select()
      .from(schema.hitlRequests)
      .where(eq(schema.hitlRequests.id, id))
      .get();

    if (!hitl) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'HITL request not found' } });
    }

    if (hitl.status !== 'pending') {
      return res.status(400).json({ error: { code: 'INVALID_STATE', message: 'HITL request already responded' } });
    }

    // Check timeout
    if (hitl.expiresAt && new Date() > new Date(hitl.expiresAt)) {
      await db
        .update(schema.hitlRequests)
        .set({ status: 'timeout' })
        .where(eq(schema.hitlRequests.id, id));

      return res.status(400).json({ error: { code: 'TIMEOUT', message: 'HITL request has expired' } });
    }

    let newStatus: 'approved' | 'rejected';
    let responseData: any = null;

    switch (action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'reject':
        newStatus = 'rejected';
        responseData = { reason };
        break;
      case 'submit':
        newStatus = 'approved';
        responseData = data;
        break;
      default:
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid action' } });
    }

    const result = await db
      .update(schema.hitlRequests)
      .set({
        status: newStatus,
        responseData,
        respondedAt: new Date(),
      })
      .where(eq(schema.hitlRequests.id, id))
      .returning()
      .get();

    // Create hitl_response case step so it appears in chat history
    const parentStep = await db
      .select()
      .from(schema.caseSteps)
      .where(
        and(
          eq(schema.caseSteps.executionId, hitl.executionId),
          eq(schema.caseSteps.type, 'hitl_request'),
        ),
      )
      .get();

    if (parentStep) {
      const stepCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.caseSteps)
        .where(eq(schema.caseSteps.caseId, parentStep.caseId))
        .get();

      await db.insert(schema.caseSteps).values({
        id: nanoid(16),
        caseId: parentStep.caseId,
        stepIndex: stepCountResult?.count || 0,
        type: 'hitl_response',
        content: JSON.stringify({
          status: newStatus,
          action,
          data: responseData,
          reason,
          hitlRequestId: id,
        }),
        executionId: hitl.executionId,
        scenarioId: parentStep.scenarioId,
        createdAt: new Date(),
      });
    }

    res.json({
      id: result?.id,
      status: result?.status,
      respondedAt: result?.respondedAt,
    });
  } catch (error) {
    console.error('Error responding to HITL:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to respond to HITL request' } });
  }
});
