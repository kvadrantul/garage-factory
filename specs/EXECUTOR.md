# Executor Specification

## Overview

The Workflow Executor is the core engine that runs workflows. It processes nodes in topological order, handles branching logic, manages HITL pauses, and reports status via WebSocket.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORKFLOW EXECUTOR                            │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    ExecutionRunner                          │ │
│  │                                                             │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │ │
│  │  │   Graph     │  │   State     │  │    Event            │ │ │
│  │  │   Resolver  │  │   Manager   │  │    Emitter          │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │ │
│  │         │               │                    │             │ │
│  │         └───────────────┼────────────────────┘             │ │
│  │                         │                                   │ │
│  │                   ┌─────────────┐                          │ │
│  │                   │    Node     │                          │ │
│  │                   │   Runner    │                          │ │
│  │                   └─────────────┘                          │ │
│  │                         │                                   │ │
│  └─────────────────────────┼───────────────────────────────────┘ │
│                            │                                     │
│  ┌─────────────────────────┼───────────────────────────────────┐ │
│  │                  Node Registry                               │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │ │
│  │  │Webhook │ │  HTTP  │ │  Code  │ │ Agent  │ │  HITL  │    │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    │ │
│  └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Classes

### ExecutionRunner

Main orchestrator for workflow execution.

```typescript
// packages/backend/executor/execution-runner.ts

import { EventEmitter } from 'events';
import { GraphResolver } from './graph-resolver';
import { StateManager } from './state-manager';
import { nodeRegistry } from '../nodes/registry';
import { db } from '../db';
import { executions, executionNodes, hitlRequests } from '@/shared/schema';

export class ExecutionRunner extends EventEmitter {
  private graphResolver: GraphResolver;
  private stateManager: StateManager;
  private abortController: AbortController;
  
  constructor(
    private workflowId: string,
    private definition: WorkflowDefinition,
    private triggerType: TriggerType,
    private triggerData: any,
  ) {
    super();
    this.graphResolver = new GraphResolver(definition);
    this.stateManager = new StateManager();
    this.abortController = new AbortController();
  }
  
  async execute(): Promise<ExecutionResult> {
    // 1. Create execution record
    const execution = await this.createExecution();
    this.emit('execution:started', { executionId: execution.id });
    
    try {
      // 2. Get starting nodes (triggers)
      const startNodes = this.graphResolver.getStartNodes();
      
      // 3. Execute from triggers
      for (const nodeId of startNodes) {
        await this.executeNode(execution.id, nodeId, this.triggerData);
      }
      
      // 4. Process remaining nodes in order
      await this.processGraph(execution.id);
      
      // 5. Mark completed
      await this.completeExecution(execution.id, 'completed');
      this.emit('execution:completed', { executionId: execution.id });
      
      return { executionId: execution.id, status: 'completed' };
      
    } catch (error) {
      await this.completeExecution(execution.id, 'failed', error.message);
      this.emit('execution:failed', { executionId: execution.id, error: error.message });
      throw error;
    }
  }
  
  private async processGraph(executionId: string): Promise<void> {
    const executionOrder = this.graphResolver.getExecutionOrder();
    
    for (const nodeId of executionOrder) {
      // Check if already executed (triggers)
      if (this.stateManager.isExecuted(nodeId)) continue;
      
      // Check if aborted
      if (this.abortController.signal.aborted) {
        throw new Error('Execution aborted');
      }
      
      // Check if all inputs are ready
      const inputs = this.graphResolver.getNodeInputs(nodeId);
      const allInputsReady = inputs.every(inputNodeId => 
        this.stateManager.isExecuted(inputNodeId)
      );
      
      if (!allInputsReady) {
        // Skip for now, will be processed when inputs are ready
        continue;
      }
      
      // Get input data from connected nodes
      const inputData = this.collectInputData(nodeId);
      
      // Execute node
      await this.executeNode(executionId, nodeId, inputData);
    }
  }
  
  private async executeNode(
    executionId: string, 
    nodeId: string, 
    inputData: any
  ): Promise<void> {
    const node = this.definition.nodes.find(n => n.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    
    // Get node runner
    const runner = nodeRegistry[node.type];
    if (!runner) throw new Error(`No runner for node type ${node.type}`);
    
    // Create node execution record
    await this.createNodeExecution(executionId, nodeId, inputData);
    this.emit('execution:node:started', { executionId, nodeId });
    
    try {
      // Build context
      const context: NodeContext = {
        node,
        inputs: { main: [inputData] },
        credentials: await this.resolveCredentials(node),
        execution: { id: executionId, workflowId: this.workflowId },
        helpers: this.createHelpers(),
        emit: (event, data) => this.emit(event, { executionId, nodeId, ...data }),
      };
      
      // Execute
      const result = await runner.execute(context);
      
      // Handle HITL
      if (result.waitForHitl) {
        await this.handleHitl(executionId, nodeId, result.waitForHitl, inputData);
        return;
      }
      
      // Store result
      this.stateManager.setNodeResult(nodeId, result);
      await this.updateNodeExecution(executionId, nodeId, 'completed', result.data);
      
      this.emit('execution:node:completed', { 
        executionId, 
        nodeId, 
        output: result.data 
      });
      
      // Handle conditional outputs (If, Switch)
      if (result.outputIndex !== undefined) {
        this.stateManager.setOutputIndex(nodeId, result.outputIndex);
      }
      
      // Process downstream nodes that are now ready
      await this.processDownstreamNodes(executionId, nodeId);
      
    } catch (error) {
      await this.updateNodeExecution(executionId, nodeId, 'error', null, error.message);
      this.emit('execution:node:error', { executionId, nodeId, error: error.message });
      throw error;
    }
  }
  
  private async handleHitl(
    executionId: string,
    nodeId: string,
    request: HITLRequest,
    inputData: any,
  ): Promise<void> {
    // Create HITL request in database
    const hitl = await db.insert(hitlRequests).values({
      executionId,
      nodeId,
      type: request.type,
      requestData: request,
      expiresAt: request.timeoutSeconds 
        ? new Date(Date.now() + request.timeoutSeconds * 1000)
        : null,
    }).returning().get();
    
    // Update execution status
    await db.update(executions)
      .set({ status: 'waiting_hitl' })
      .where(eq(executions.id, executionId));
    
    // Emit HITL event
    this.emit('hitl:required', {
      executionId,
      hitlId: hitl.id,
      nodeId,
      type: request.type,
      requestData: request,
      expiresAt: hitl.expiresAt,
    });
    
    // Wait for response
    const response = await this.waitForHitlResponse(hitl.id, request.timeoutSeconds);
    
    // Process response
    if (response.status === 'timeout') {
      throw new Error('HITL request timed out');
    }
    
    if (response.status === 'rejected') {
      throw new Error('HITL request rejected');
    }
    
    // Continue execution with response data
    const outputData = {
      ...inputData,
      hitlResponse: response.responseData,
      approved: response.status === 'approved',
    };
    
    this.stateManager.setNodeResult(nodeId, { data: outputData });
    await this.updateNodeExecution(executionId, nodeId, 'completed', outputData);
    
    this.emit('hitl:resolved', { executionId, hitlId: hitl.id, status: response.status });
    this.emit('execution:node:completed', { executionId, nodeId, output: outputData });
    
    // Update execution status back to running
    await db.update(executions)
      .set({ status: 'running' })
      .where(eq(executions.id, executionId));
    
    // Continue processing
    await this.processDownstreamNodes(executionId, nodeId);
  }
  
  private async waitForHitlResponse(
    hitlId: string, 
    timeoutSeconds?: number
  ): Promise<HITLResponse> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const hitl = await db.query.hitlRequests.findFirst({
          where: eq(hitlRequests.id, hitlId),
        });
        
        if (hitl?.status !== 'pending') {
          clearInterval(checkInterval);
          resolve({
            status: hitl!.status,
            responseData: hitl!.responseData,
          });
        }
        
        // Check timeout
        if (hitl?.expiresAt && new Date() > hitl.expiresAt) {
          clearInterval(checkInterval);
          await db.update(hitlRequests)
            .set({ status: 'timeout' })
            .where(eq(hitlRequests.id, hitlId));
          resolve({ status: 'timeout', responseData: null });
        }
      }, 1000);
    });
  }
  
  // Abort execution
  abort(): void {
    this.abortController.abort();
  }
  
  // Helper methods...
  private collectInputData(nodeId: string): any {
    const inputs = this.graphResolver.getNodeInputs(nodeId);
    const results = inputs.map(inputId => {
      const result = this.stateManager.getNodeResult(inputId);
      const outputIndex = this.stateManager.getOutputIndex(inputId);
      
      // Check if this edge matches the output index (for conditional nodes)
      const edge = this.definition.edges.find(
        e => e.source === inputId && e.target === nodeId
      );
      
      if (outputIndex !== undefined && edge?.sourceHandle) {
        const handleIndex = parseInt(edge.sourceHandle.replace('output_', ''));
        if (handleIndex !== outputIndex) {
          return null; // This branch was not taken
        }
      }
      
      return result?.data;
    }).filter(Boolean);
    
    return results.length === 1 ? results[0] : results;
  }
  
  private async processDownstreamNodes(executionId: string, nodeId: string): Promise<void> {
    const downstream = this.graphResolver.getDownstreamNodes(nodeId);
    
    for (const downstreamId of downstream) {
      const inputs = this.graphResolver.getNodeInputs(downstreamId);
      const allReady = inputs.every(id => this.stateManager.isExecuted(id));
      
      if (allReady) {
        const inputData = this.collectInputData(downstreamId);
        if (inputData !== null) {
          await this.executeNode(executionId, downstreamId, inputData);
        }
      }
    }
  }
  
  private createHelpers(): NodeHelpers {
    return {
      httpRequest: async (options) => {
        const response = await fetch(options.url, {
          method: options.method || 'GET',
          headers: options.headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        
        return {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.json().catch(() => response.text()),
        };
      },
      
      getCredential: async (name) => {
        // Retrieve and decrypt credential
        const cred = await db.query.credentials.findFirst({
          where: eq(credentials.name, name),
        });
        if (!cred) throw new Error(`Credential ${name} not found`);
        return decryptCredential(cred.data);
      },
    };
  }
}
```

### GraphResolver

Resolves workflow graph topology and execution order.

```typescript
// packages/backend/executor/graph-resolver.ts

export class GraphResolver {
  private adjacencyList: Map<string, string[]>;
  private reverseAdjacencyList: Map<string, string[]>;
  
  constructor(private definition: WorkflowDefinition) {
    this.buildGraph();
  }
  
  private buildGraph(): void {
    this.adjacencyList = new Map();
    this.reverseAdjacencyList = new Map();
    
    // Initialize all nodes
    for (const node of this.definition.nodes) {
      this.adjacencyList.set(node.id, []);
      this.reverseAdjacencyList.set(node.id, []);
    }
    
    // Build edges
    for (const edge of this.definition.edges) {
      this.adjacencyList.get(edge.source)!.push(edge.target);
      this.reverseAdjacencyList.get(edge.target)!.push(edge.source);
    }
  }
  
  // Get nodes with no incoming edges (triggers)
  getStartNodes(): string[] {
    return this.definition.nodes
      .filter(node => {
        const inputs = this.reverseAdjacencyList.get(node.id) || [];
        return inputs.length === 0;
      })
      .map(node => node.id);
  }
  
  // Topological sort for execution order
  getExecutionOrder(): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      
      const inputs = this.reverseAdjacencyList.get(nodeId) || [];
      for (const input of inputs) {
        visit(input);
      }
      
      order.push(nodeId);
    };
    
    for (const node of this.definition.nodes) {
      visit(node.id);
    }
    
    return order;
  }
  
  // Get input node IDs for a node
  getNodeInputs(nodeId: string): string[] {
    return this.reverseAdjacencyList.get(nodeId) || [];
  }
  
  // Get output node IDs from a node
  getDownstreamNodes(nodeId: string): string[] {
    return this.adjacencyList.get(nodeId) || [];
  }
  
  // Get specific edge for conditional routing
  getEdge(sourceId: string, targetId: string): WorkflowEdge | undefined {
    return this.definition.edges.find(
      e => e.source === sourceId && e.target === targetId
    );
  }
}
```

### StateManager

Manages execution state during workflow run.

```typescript
// packages/backend/executor/state-manager.ts

export class StateManager {
  private nodeResults: Map<string, NodeResult>;
  private outputIndices: Map<string, number>;
  private executedNodes: Set<string>;
  
  constructor() {
    this.nodeResults = new Map();
    this.outputIndices = new Map();
    this.executedNodes = new Set();
  }
  
  setNodeResult(nodeId: string, result: NodeResult): void {
    this.nodeResults.set(nodeId, result);
    this.executedNodes.add(nodeId);
  }
  
  getNodeResult(nodeId: string): NodeResult | undefined {
    return this.nodeResults.get(nodeId);
  }
  
  setOutputIndex(nodeId: string, index: number): void {
    this.outputIndices.set(nodeId, index);
  }
  
  getOutputIndex(nodeId: string): number | undefined {
    return this.outputIndices.get(nodeId);
  }
  
  isExecuted(nodeId: string): boolean {
    return this.executedNodes.has(nodeId);
  }
  
  reset(): void {
    this.nodeResults.clear();
    this.outputIndices.clear();
    this.executedNodes.clear();
  }
}
```

## Execution Service

Service layer for managing executions.

```typescript
// packages/backend/services/execution.service.ts

import { ExecutionRunner } from '../executor/execution-runner';
import { db } from '../db';
import { workflows, executions } from '@/shared/schema';

class ExecutionService {
  private activeExecutions: Map<string, ExecutionRunner>;
  private eventEmitter: EventEmitter;
  
  constructor(eventEmitter: EventEmitter) {
    this.activeExecutions = new Map();
    this.eventEmitter = eventEmitter;
  }
  
  async executeWorkflow(
    workflowId: string, 
    triggerType: TriggerType,
    triggerData: any
  ): Promise<{ executionId: string }> {
    // Get workflow
    const workflow = await db.query.workflows.findFirst({
      where: eq(workflows.id, workflowId),
    });
    
    if (!workflow) throw new Error('Workflow not found');
    
    // Create runner
    const runner = new ExecutionRunner(
      workflowId,
      workflow.definition,
      triggerType,
      triggerData,
    );
    
    // Forward events to WebSocket
    runner.on('execution:started', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('execution:node:started', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('execution:node:completed', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('execution:node:error', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('execution:completed', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('execution:failed', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('hitl:required', (data) => this.eventEmitter.emit('ws:broadcast', data));
    runner.on('hitl:resolved', (data) => this.eventEmitter.emit('ws:broadcast', data));
    
    // Start execution (async)
    const executionPromise = runner.execute();
    
    // Wait for execution ID to be created
    const executionId = await new Promise<string>((resolve) => {
      runner.once('execution:started', ({ executionId }) => resolve(executionId));
    });
    
    // Store active execution
    this.activeExecutions.set(executionId, runner);
    
    // Cleanup on completion
    executionPromise.finally(() => {
      this.activeExecutions.delete(executionId);
    });
    
    return { executionId };
  }
  
  async stopExecution(executionId: string): Promise<void> {
    const runner = this.activeExecutions.get(executionId);
    if (runner) {
      runner.abort();
    }
    
    await db.update(executions)
      .set({ status: 'stopped', finishedAt: new Date() })
      .where(eq(executions.id, executionId));
  }
  
  async respondToHitl(hitlId: string, response: HITLResponseInput): Promise<void> {
    await db.update(hitlRequests)
      .set({
        status: response.action === 'approve' ? 'approved' : 
                response.action === 'reject' ? 'rejected' : 'approved',
        responseData: response.data,
        respondedAt: new Date(),
      })
      .where(eq(hitlRequests.id, hitlId));
  }
}

export const executionService = new ExecutionService(globalEventEmitter);
```

## Scheduler

Handles scheduled workflow triggers.

```typescript
// packages/backend/scheduler/scheduler.ts

import { CronJob } from 'cron';
import { db } from '../db';
import { workflows, webhooks } from '@/shared/schema';
import { executionService } from '../services/execution.service';

class Scheduler {
  private jobs: Map<string, CronJob>;
  
  constructor() {
    this.jobs = new Map();
  }
  
  async initialize(): Promise<void> {
    // Load active workflows with schedule triggers
    const activeWorkflows = await db.query.workflows.findMany({
      where: eq(workflows.active, true),
    });
    
    for (const workflow of activeWorkflows) {
      this.registerWorkflowSchedules(workflow);
    }
  }
  
  registerWorkflowSchedules(workflow: Workflow): void {
    const scheduleNodes = workflow.definition.nodes.filter(
      n => n.type === 'schedule-trigger'
    );
    
    for (const node of scheduleNodes) {
      const { cronExpression, timezone } = node.data.config;
      const jobId = `${workflow.id}:${node.id}`;
      
      // Remove existing job
      this.jobs.get(jobId)?.stop();
      
      // Create new job
      const job = new CronJob(
        cronExpression,
        async () => {
          await executionService.executeWorkflow(
            workflow.id,
            'schedule',
            { scheduled: new Date().toISOString() }
          );
        },
        null,
        true,
        timezone || 'UTC'
      );
      
      this.jobs.set(jobId, job);
    }
  }
  
  unregisterWorkflow(workflowId: string): void {
    for (const [jobId, job] of this.jobs) {
      if (jobId.startsWith(workflowId)) {
        job.stop();
        this.jobs.delete(jobId);
      }
    }
  }
}

export const scheduler = new Scheduler();
```

## Webhook Handler

Handles incoming webhook requests.

```typescript
// packages/backend/webhooks/webhook-handler.ts

import { Router } from 'express';
import { db } from '../db';
import { webhooks, workflows } from '@/shared/schema';
import { executionService } from '../services/execution.service';

export const webhookRouter = Router();

webhookRouter.all('/:path', async (req, res) => {
  const { path } = req.params;
  
  // Find webhook
  const webhook = await db.query.webhooks.findFirst({
    where: and(
      eq(webhooks.path, path),
      eq(webhooks.active, true),
    ),
  });
  
  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }
  
  // Check method
  if (webhook.method !== req.method && webhook.method !== 'ALL') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Build trigger data
  const triggerData = {
    headers: req.headers,
    query: req.query,
    body: req.body,
    method: req.method,
    path: req.path,
  };
  
  try {
    // Execute workflow
    const { executionId } = await executionService.executeWorkflow(
      webhook.workflowId,
      'webhook',
      triggerData
    );
    
    // TODO: Handle response modes (immediate, lastNode, etc.)
    res.json({ executionId, status: 'accepted' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## Error Handling

```typescript
// packages/backend/executor/errors.ts

export class ExecutionError extends Error {
  constructor(
    message: string,
    public nodeId?: string,
    public executionId?: string,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

export class NodeExecutionError extends ExecutionError {
  constructor(
    message: string,
    nodeId: string,
    public nodeType: string,
    executionId?: string,
  ) {
    super(message, nodeId, executionId);
    this.name = 'NodeExecutionError';
  }
}

export class HITLTimeoutError extends ExecutionError {
  constructor(nodeId: string, executionId: string) {
    super('HITL request timed out', nodeId, executionId);
    this.name = 'HITLTimeoutError';
  }
}

export class AbortedError extends ExecutionError {
  constructor(executionId: string) {
    super('Execution was aborted', undefined, executionId);
    this.name = 'AbortedError';
  }
}
```

## Testing

```typescript
// packages/backend/executor/__tests__/execution-runner.test.ts

describe('ExecutionRunner', () => {
  it('should execute simple linear workflow', async () => {
    const workflow = createTestWorkflow([
      { id: 'trigger', type: 'manual-trigger' },
      { id: 'http', type: 'http-request', config: { url: 'https://api.example.com' } },
    ], [
      { source: 'trigger', target: 'http' },
    ]);
    
    const runner = new ExecutionRunner('wf1', workflow, 'manual', {});
    const result = await runner.execute();
    
    expect(result.status).toBe('completed');
  });
  
  it('should handle If node branching', async () => {
    const workflow = createTestWorkflow([
      { id: 'trigger', type: 'manual-trigger' },
      { id: 'if', type: 'if', config: { conditions: [{ field: 'value', operation: 'equals', value: true }] } },
      { id: 'true-branch', type: 'set' },
      { id: 'false-branch', type: 'set' },
    ], [
      { source: 'trigger', target: 'if' },
      { source: 'if', target: 'true-branch', sourceHandle: 'output_0' },
      { source: 'if', target: 'false-branch', sourceHandle: 'output_1' },
    ]);
    
    const runner = new ExecutionRunner('wf1', workflow, 'manual', { value: true });
    const result = await runner.execute();
    
    // Only true-branch should be executed
  });
  
  it('should wait for HITL response', async () => {
    // Test HITL flow
  });
});
```
