# Database Schema Specification

## Overview

SQLite database with Drizzle ORM for type-safe queries.

## Schema Definition (Drizzle)

```typescript
// packages/shared/schema.ts

import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { createId } from '@paralleldrive/cuid2';

// ============================================
// WORKFLOWS
// ============================================

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description'),
  
  // Workflow definition (nodes, edges, settings)
  definition: text('definition', { mode: 'json' }).notNull().$type<WorkflowDefinition>(),
  
  // Workflow settings
  settings: text('settings', { mode: 'json' }).$type<WorkflowSettings>(),
  
  // Status
  active: integer('active', { mode: 'boolean' }).default(false),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXECUTIONS
// ============================================

export const executions = sqliteTable('executions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  
  // Execution status
  status: text('status', { 
    enum: ['pending', 'running', 'waiting_hitl', 'completed', 'failed', 'stopped'] 
  }).notNull().default('pending'),
  
  // Trigger info
  triggerType: text('trigger_type', { enum: ['manual', 'webhook', 'schedule'] }).notNull(),
  triggerData: text('trigger_data', { mode: 'json' }),
  
  // Error info
  error: text('error'),
  
  // Timestamps
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXECUTION NODE DATA
// ============================================

export const executionNodes = sqliteTable('execution_nodes', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // Node ID within workflow
  
  // Node execution status
  status: text('status', { 
    enum: ['pending', 'running', 'completed', 'error', 'skipped', 'waiting_hitl'] 
  }).notNull().default('pending'),
  
  // Input/Output data
  inputData: text('input_data', { mode: 'json' }),
  outputData: text('output_data', { mode: 'json' }),
  
  // Error info
  error: text('error'),
  
  // HITL data (if applicable)
  hitlData: text('hitl_data', { mode: 'json' }).$type<HITLData>(),
  
  // Timestamps
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

// ============================================
// CREDENTIALS
// ============================================

export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  type: text('type').notNull(), // 'api_key', 'oauth2', 'basic_auth', etc.
  
  // Encrypted credential data
  data: blob('data', { mode: 'buffer' }).notNull(), // Encrypted JSON
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// WEBHOOKS
// ============================================

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(), // Webhook trigger node ID
  
  // Webhook path (unique identifier in URL)
  path: text('path').notNull().unique(),
  
  // HTTP method
  method: text('method', { enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }).default('POST'),
  
  // Active status
  active: integer('active', { mode: 'boolean' }).default(true),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// HITL REQUESTS
// ============================================

export const hitlRequests = sqliteTable('hitl_requests', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  executionId: text('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  
  // Request type and data
  type: text('type', { enum: ['approval', 'input', 'selection'] }).notNull(),
  requestData: text('request_data', { mode: 'json' }).notNull().$type<HITLRequestData>(),
  
  // Response
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'timeout'] }).default('pending'),
  responseData: text('response_data', { mode: 'json' }),
  respondedAt: integer('responded_at', { mode: 'timestamp' }),
  
  // Timeout
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});
```

## TypeScript Types

```typescript
// packages/shared/types.ts

// ============================================
// WORKFLOW DEFINITION
// ============================================

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export type NodeType = 
  | 'webhook-trigger'
  | 'schedule-trigger'
  | 'manual-trigger'
  | 'http-request'
  | 'code'
  | 'if'
  | 'switch'
  | 'merge'
  | 'split'
  | 'agent'
  | 'hitl'
  | 'set';

export interface NodeData {
  name?: string;
  config: Record<string, any>; // Node-specific configuration
  credentials?: string; // Credential ID reference
}

export interface WorkflowEdge {
  id: string;
  source: string;      // Source node ID
  sourceHandle?: string; // Output handle (for multi-output nodes)
  target: string;      // Target node ID
  targetHandle?: string; // Input handle
  label?: string;
}

// ============================================
// WORKFLOW SETTINGS
// ============================================

export interface WorkflowSettings {
  errorHandling?: 'stop' | 'continue';
  timeout?: number; // seconds
  retryOnFail?: boolean;
  maxRetries?: number;
}

// ============================================
// HITL DATA
// ============================================

export interface HITLData {
  requestId: string;
  type: 'approval' | 'input' | 'selection';
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
  response?: any;
}

export interface HITLRequestData {
  message: string;
  details?: string;
  // For input type
  fields?: HITLField[];
  // For selection type
  options?: HITLOption[];
  // Timeout
  timeoutSeconds?: number;
}

export interface HITLField {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'textarea';
  label: string;
  required?: boolean;
  default?: any;
  options?: { label: string; value: any }[];
}

export interface HITLOption {
  label: string;
  value: string;
  description?: string;
}

// ============================================
// EXECUTION TYPES
// ============================================

export type ExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'waiting_hitl' 
  | 'completed' 
  | 'failed' 
  | 'stopped';

export type NodeExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'error' 
  | 'skipped' 
  | 'waiting_hitl';

// ============================================
// CREDENTIAL TYPES
// ============================================

export type CredentialType = 
  | 'api_key' 
  | 'bearer_token' 
  | 'basic_auth' 
  | 'oauth2' 
  | 'header_auth';

export interface CredentialData {
  type: CredentialType;
  // API Key
  apiKey?: string;
  headerName?: string; // e.g., 'X-API-Key', 'Authorization'
  prefix?: string;     // e.g., 'Bearer ', 'Api-Key '
  // Basic Auth
  username?: string;
  password?: string;
  // OAuth2 (simplified)
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}
```

## Indexes

```sql
-- Performance indexes
CREATE INDEX idx_executions_workflow_id ON executions(workflow_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_created_at ON executions(created_at);

CREATE INDEX idx_execution_nodes_execution_id ON execution_nodes(execution_id);
CREATE INDEX idx_execution_nodes_status ON execution_nodes(status);

CREATE INDEX idx_webhooks_workflow_id ON webhooks(workflow_id);
CREATE INDEX idx_webhooks_path ON webhooks(path);

CREATE INDEX idx_hitl_requests_execution_id ON hitl_requests(execution_id);
CREATE INDEX idx_hitl_requests_status ON hitl_requests(status);
```

## Migrations

```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './packages/shared/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: './database.sqlite',
  },
} satisfies Config;
```

## Queries Examples

```typescript
// Get workflow with recent executions
const workflowWithExecutions = await db
  .select()
  .from(workflows)
  .leftJoin(executions, eq(executions.workflowId, workflows.id))
  .where(eq(workflows.id, workflowId))
  .orderBy(desc(executions.createdAt))
  .limit(10);

// Get execution with all node data
const executionWithNodes = await db
  .select()
  .from(executions)
  .leftJoin(executionNodes, eq(executionNodes.executionId, executions.id))
  .where(eq(executions.id, executionId));

// Get pending HITL requests
const pendingHitl = await db
  .select()
  .from(hitlRequests)
  .where(
    and(
      eq(hitlRequests.status, 'pending'),
      gt(hitlRequests.expiresAt, new Date())
    )
  );
```

## Data Lifecycle

### Workflow
- Created when user saves from canvas
- Updated on every save
- Deleted with cascade to executions, webhooks

### Execution
- Created when workflow triggered
- Updated during execution (status changes)
- Execution nodes created as each node runs
- Retained for history (pruning optional)

### HITL Request
- Created when executor reaches HITL node
- Updated when user responds
- Auto-expired after timeout
- Linked to execution for cleanup
