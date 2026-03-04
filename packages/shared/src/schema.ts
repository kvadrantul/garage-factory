// Database Schema for Orchestrator
// Using Drizzle ORM with SQLite

import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ============================================
// Helper for generating IDs
// ============================================
const generateId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
};

// ============================================
// WORKFLOWS
// ============================================
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull(),
  description: text('description'),
  definition: text('definition', { mode: 'json' }).notNull().$type<WorkflowDefinition>(),
  settings: text('settings', { mode: 'json' }).$type<WorkflowSettings>(),
  active: integer('active', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXECUTIONS
// ============================================
export const executions = sqliteTable('executions', {
  id: text('id').primaryKey().$defaultFn(generateId),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  status: text('status', {
    enum: ['pending', 'running', 'waiting_hitl', 'completed', 'failed', 'stopped'],
  }).notNull().default('pending'),
  triggerType: text('trigger_type', { enum: ['manual', 'webhook', 'schedule'] }).notNull(),
  triggerData: text('trigger_data', { mode: 'json' }),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXECUTION NODES
// ============================================
export const executionNodes = sqliteTable('execution_nodes', {
  id: text('id').primaryKey().$defaultFn(generateId),
  executionId: text('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  status: text('status', {
    enum: ['pending', 'running', 'completed', 'error', 'skipped', 'waiting_hitl'],
  }).notNull().default('pending'),
  inputData: text('input_data', { mode: 'json' }),
  outputData: text('output_data', { mode: 'json' }),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

// ============================================
// CREDENTIALS
// ============================================
export const credentials = sqliteTable('credentials', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull(),
  type: text('type').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// WEBHOOKS
// ============================================
export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey().$defaultFn(generateId),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  path: text('path').notNull().unique(),
  method: text('method', { enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL'] }).default('POST'),
  active: integer('active', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// HITL REQUESTS
// ============================================
export const hitlRequests = sqliteTable('hitl_requests', {
  id: text('id').primaryKey().$defaultFn(generateId),
  executionId: text('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  type: text('type', { enum: ['approval', 'input', 'selection'] }).notNull(),
  requestData: text('request_data', { mode: 'json' }).notNull(),
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'timeout'] }).default('pending'),
  responseData: text('response_data', { mode: 'json' }),
  respondedAt: integer('responded_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// RELATIONS
// ============================================
export const workflowsRelations = relations(workflows, ({ many }) => ({
  executions: many(executions),
  webhooks: many(webhooks),
}));

export const executionsRelations = relations(executions, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [executions.workflowId],
    references: [workflows.id],
  }),
  nodes: many(executionNodes),
  hitlRequests: many(hitlRequests),
}));

export const executionNodesRelations = relations(executionNodes, ({ one }) => ({
  execution: one(executions, {
    fields: [executionNodes.executionId],
    references: [executions.id],
  }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  workflow: one(workflows, {
    fields: [webhooks.workflowId],
    references: [workflows.id],
  }),
}));

export const hitlRequestsRelations = relations(hitlRequests, ({ one }) => ({
  execution: one(executions, {
    fields: [hitlRequests.executionId],
    references: [executions.id],
  }),
}));

// ============================================
// CUSTOM NODES
// ============================================
export const customNodes = sqliteTable('custom_nodes', {
  id: text('id').primaryKey(),
  manifest: text('manifest', { mode: 'json' }).$type<CustomNodeManifest>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT: DOMAINS
// ============================================
export const domains = sqliteTable('domains', {
  id: text('id').primaryKey().$defaultFn(generateId),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  icon: text('icon'),
  agentId: text('agent_id'),
  systemPrompt: text('system_prompt'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT: SCENARIOS (TOOLS)
// ============================================
export const scenarios = sqliteTable('scenarios', {
  id: text('id').primaryKey().$defaultFn(generateId),
  workflowId: text('workflow_id').notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  toolName: text('tool_name').notNull(),
  name: text('name').notNull(),
  shortDescription: text('short_description').notNull(),
  whenToApply: text('when_to_apply').notNull(),
  inputsSchema: text('inputs_schema', { mode: 'json' }),
  outputsSchema: text('outputs_schema', { mode: 'json' }),
  riskClass: text('risk_class', { enum: ['read_only', 'write', 'financial', 'legal_opinion'] }).default('read_only'),
  estimatedDuration: text('estimated_duration', { enum: ['fast', 'medium', 'long'] }).default('fast'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT: CASES (SESSIONS)
// ============================================
export const cases = sqliteTable('cases', {
  id: text('id').primaryKey().$defaultFn(generateId),
  domainId: text('domain_id').notNull().references(() => domains.id, { onDelete: 'cascade' }),
  title: text('title'),
  status: text('status', { enum: ['open', 'completed', 'abandoned'] }).default('open'),
  openclawSessionId: text('openclaw_session_id'),
  summary: text('summary'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT: CASE STEPS
// ============================================
export const caseSteps = sqliteTable('case_steps', {
  id: text('id').primaryKey().$defaultFn(generateId),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  stepIndex: integer('step_index').notNull(),
  type: text('type', { enum: ['user_message', 'assistant_message', 'tool_call', 'tool_result', 'hitl_request', 'hitl_response', 'error', 'file_upload'] }).notNull(),
  content: text('content', { mode: 'json' }),
  executionId: text('execution_id').references(() => executions.id),
  scenarioId: text('scenario_id').references(() => scenarios.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT: CASE ARTIFACTS
// ============================================
export const caseArtifacts = sqliteTable('case_artifacts', {
  id: text('id').primaryKey().$defaultFn(generateId),
  caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  filePath: text('file_path').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull().default(0),
  sourceType: text('source_type', { enum: ['upload', 'skill_output', 'generated'] }).notNull(),
  sourceStepId: text('source_step_id').references(() => caseSteps.id),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// ============================================
// EXPERT AGENT RELATIONS
// ============================================
export const domainsRelations = relations(domains, ({ many }) => ({
  scenarios: many(scenarios),
  cases: many(cases),
}));

export const scenariosRelations = relations(scenarios, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [scenarios.workflowId],
    references: [workflows.id],
  }),
  domain: one(domains, {
    fields: [scenarios.domainId],
    references: [domains.id],
  }),
  caseSteps: many(caseSteps),
}));

export const casesRelations = relations(cases, ({ one, many }) => ({
  domain: one(domains, {
    fields: [cases.domainId],
    references: [domains.id],
  }),
  steps: many(caseSteps),
  artifacts: many(caseArtifacts),
}));

export const caseStepsRelations = relations(caseSteps, ({ one }) => ({
  case: one(cases, {
    fields: [caseSteps.caseId],
    references: [cases.id],
  }),
  execution: one(executions, {
    fields: [caseSteps.executionId],
    references: [executions.id],
  }),
  scenario: one(scenarios, {
    fields: [caseSteps.scenarioId],
    references: [scenarios.id],
  }),
}));

export const caseArtifactsRelations = relations(caseArtifacts, ({ one }) => ({
  case: one(cases, {
    fields: [caseArtifacts.caseId],
    references: [cases.id],
  }),
  sourceStep: one(caseSteps, {
    fields: [caseArtifacts.sourceStepId],
    references: [caseSteps.id],
  }),
}));

// ============================================
// TYPE IMPORTS (from types.ts)
// ============================================
import type { WorkflowDefinition, WorkflowSettings, CustomNodeManifest } from './types';
