// Credentials API Routes

import { Router, type Router as RouterType } from 'express';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';

export const credentialsRouter: RouterType = Router();

// List all credentials (without sensitive data)
credentialsRouter.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const results = await db
      .select({
        id: schema.credentials.id,
        name: schema.credentials.name,
        type: schema.credentials.type,
        createdAt: schema.credentials.createdAt,
        updatedAt: schema.credentials.updatedAt,
      })
      .from(schema.credentials)
      .orderBy(desc(schema.credentials.updatedAt))
      .limit(limit)
      .offset(offset);

    const total = await db
      .select()
      .from(schema.credentials);

    res.json({
      data: results,
      total: total.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error listing credentials:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to list credentials' } });
  }
});

// Get credential by ID (without sensitive data)
credentialsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const credential = await db
      .select({
        id: schema.credentials.id,
        name: schema.credentials.name,
        type: schema.credentials.type,
        createdAt: schema.credentials.createdAt,
        updatedAt: schema.credentials.updatedAt,
      })
      .from(schema.credentials)
      .where(eq(schema.credentials.id, id))
      .get();

    if (!credential) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Credential not found' } });
    }

    res.json(credential);
  } catch (error) {
    console.error('Error getting credential:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to get credential' } });
  }
});

// Create credential
credentialsRouter.post('/', async (req, res) => {
  try {
    const { name, type, data } = req.body as {
      name: string;
      type: string;
      data: Record<string, unknown>;
    };

    if (!name || !type || !data) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'name, type, and data are required' },
      });
    }

    // Store data as JSON buffer
    const dataBuffer = Buffer.from(JSON.stringify(data), 'utf-8');

    const now = new Date();
    const result = await db
      .insert(schema.credentials)
      .values({
        name,
        type,
        data: dataBuffer,
        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: schema.credentials.id,
        name: schema.credentials.name,
        type: schema.credentials.type,
        createdAt: schema.credentials.createdAt,
        updatedAt: schema.credentials.updatedAt,
      })
      .get();

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating credential:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create credential' } });
  }
});

// Update credential
credentialsRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, data } = req.body as {
      name?: string;
      type?: string;
      data?: Record<string, unknown>;
    };

    const existing = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Credential not found' } });
    }

    const updateData: {
      name?: string;
      type?: string;
      data?: Buffer;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (data !== undefined) updateData.data = Buffer.from(JSON.stringify(data), 'utf-8');

    const result = await db
      .update(schema.credentials)
      .set(updateData)
      .where(eq(schema.credentials.id, id))
      .returning({
        id: schema.credentials.id,
        name: schema.credentials.name,
        type: schema.credentials.type,
        createdAt: schema.credentials.createdAt,
        updatedAt: schema.credentials.updatedAt,
      })
      .get();

    res.json(result);
  } catch (error) {
    console.error('Error updating credential:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update credential' } });
  }
});

// Delete credential
credentialsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db
      .select()
      .from(schema.credentials)
      .where(eq(schema.credentials.id, id))
      .get();

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Credential not found' } });
    }

    await db
      .delete(schema.credentials)
      .where(eq(schema.credentials.id, id));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting credential:', error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to delete credential' } });
  }
});
