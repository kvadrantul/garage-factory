// Main Server Entry Point

import express, { type Express } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { initializeDatabase } from './db/index.js';
import { workflowsRouter } from './api/workflows.js';
import { executionsRouter } from './api/executions.js';
import { hitlRouter } from './api/hitl.js';

const PORT = process.env.PORT || 3000;

// Initialize Express
const app: Express = express();
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/workflows', workflowsRouter);
app.use('/api/executions', executionsRouter);
app.use('/api/hitl', hitlRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = createServer(app);

// WebSocket Setup
const wss = new WebSocketServer({ server, path: '/ws' });

// Track subscriptions
const subscriptions = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe:execution': {
          const executionId = message.executionId;
          if (!subscriptions.has(executionId)) {
            subscriptions.set(executionId, new Set());
          }
          subscriptions.get(executionId)!.add(ws);
          console.log(`Client subscribed to execution: ${executionId}`);
          break;
        }

        case 'unsubscribe:execution': {
          const executionId = message.executionId;
          subscriptions.get(executionId)?.delete(ws);
          console.log(`Client unsubscribed from execution: ${executionId}`);
          break;
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    // Remove from all subscriptions
    for (const [executionId, clients] of subscriptions) {
      clients.delete(ws);
      if (clients.size === 0) {
        subscriptions.delete(executionId);
      }
    }
    console.log('WebSocket client disconnected');
  });
});

// Broadcast function for execution events
export function broadcastExecutionEvent(executionId: string, event: { type: string; payload: any }) {
  const clients = subscriptions.get(executionId);
  if (!clients) return;

  const message = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// Broadcast to all clients
export function broadcastAll(event: { type: string; payload: any }) {
  const message = JSON.stringify(event);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize database and start server
initializeDatabase();

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║         ORCHESTRATOR SERVER               ║
  ╠═══════════════════════════════════════════╣
  ║  HTTP:  http://localhost:${PORT}             ║
  ║  WS:    ws://localhost:${PORT}/ws            ║
  ╚═══════════════════════════════════════════╝
  `);
});

export { app, server, wss };
