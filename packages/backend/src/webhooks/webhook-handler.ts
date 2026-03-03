// Webhook Handler
// Routes incoming webhook requests to trigger workflow executions

import { Router, type Router as RouterType, type Request, type Response } from 'express';
import { db, schema } from '../db/index.js';
import { eq, and } from 'drizzle-orm';
import { getExecutionService } from '../services/execution-service.js';

export const webhookRouter: RouterType = Router();

// Handle all methods for webhook paths
webhookRouter.all('/:path', async (req: Request, res: Response) => {
  try {
    const { path } = req.params;
    const method = req.method.toUpperCase();

    // Look up webhook by path
    const webhook = await db
      .select()
      .from(schema.webhooks)
      .where(and(
        eq(schema.webhooks.path, path),
        eq(schema.webhooks.active, true)
      ))
      .get();

    if (!webhook) {
      return res.status(404).json({
        error: { code: 'WEBHOOK_NOT_FOUND', message: `Webhook path '${path}' not found` }
      });
    }

    // Validate HTTP method
    if (webhook.method !== 'ALL' && webhook.method !== method) {
      return res.status(405).json({
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `Webhook expects ${webhook.method}, got ${method}`
        }
      });
    }

    // Build trigger data from request
    const triggerData = {
      headers: req.headers as Record<string, string>,
      query: req.query as Record<string, string>,
      body: req.body,
      method: method,
      path: path,
      timestamp: new Date().toISOString(),
    };

    // Execute workflow
    const service = getExecutionService();
    const { executionId } = await service.executeWorkflow(
      webhook.workflowId,
      'webhook',
      triggerData
    );

    res.status(202).json({
      executionId,
      status: 'accepted',
      message: 'Workflow execution started'
    });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({
      error: { code: 'WEBHOOK_ERROR', message: 'Failed to process webhook' }
    });
  }
});

// Helper function to register webhooks for a workflow
export async function registerWebhooksForWorkflow(workflowId: string, definition: any): Promise<void> {
  // Find all webhook-trigger nodes in the workflow
  const webhookNodes = definition.nodes.filter(
    (node: any) => node.type === 'webhook-trigger'
  );

  for (const node of webhookNodes) {
    const config = node.data?.config || {};
    const path = config.path || generateWebhookPath();
    const method = config.method || 'POST';

    // Check if webhook already exists for this node
    const existing = await db
      .select()
      .from(schema.webhooks)
      .where(and(
        eq(schema.webhooks.workflowId, workflowId),
        eq(schema.webhooks.nodeId, node.id)
      ))
      .get();

    if (existing) {
      // Update existing webhook
      await db
        .update(schema.webhooks)
        .set({ path, method, active: true })
        .where(eq(schema.webhooks.id, existing.id));
    } else {
      // Create new webhook
      await db
        .insert(schema.webhooks)
        .values({
          workflowId,
          nodeId: node.id,
          path,
          method,
          active: true,
          createdAt: new Date(),
        });
    }
  }
}

// Helper function to unregister webhooks for a workflow
export async function unregisterWebhooksForWorkflow(workflowId: string): Promise<void> {
  await db
    .update(schema.webhooks)
    .set({ active: false })
    .where(eq(schema.webhooks.workflowId, workflowId));
}

// Generate a random webhook path
function generateWebhookPath(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let path = '';
  for (let i = 0; i < 12; i++) {
    path += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return path;
}
