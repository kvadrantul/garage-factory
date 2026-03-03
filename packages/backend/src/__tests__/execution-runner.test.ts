import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WorkflowDefinition, NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

// ── Mocks ──────────────────────────────────────────────

// Mock db: all insert/update/select calls resolve with sensible stubs
let insertCounter = 0;
const mockDb = {
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  get: vi.fn(() => ({ id: `row-${++insertCounter}` })),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
};

// Chain builder: every method returns itself so chained calls work
for (const key of Object.keys(mockDb)) {
  const fn = mockDb[key as keyof typeof mockDb];
  if (typeof fn === 'function' && key !== 'get') {
    (fn as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);
  }
}
mockDb.get.mockImplementation(() => ({ id: `row-${++insertCounter}` }));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    executions: { id: 'id' },
    executionNodes: { id: 'id' },
    hitlRequests: { id: 'id' },
    credentials: { name: 'name' },
  },
}));

// Mutable registry so each test can set its own runners
const testRegistry: Record<string, NodeRunner> = {};
vi.mock('../nodes/registry.js', () => ({
  nodeRegistry: testRegistry,
}));

// Now import the system under test *after* mocks are set up
const { ExecutionRunner } = await import('../executor/execution-runner.js');

// ── Helpers ────────────────────────────────────────────

function buildDefinition(
  nodes: { id: string; type: string }[],
  edges: { source: string; target: string; sourceHandle?: string }[],
): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as any,
      position: { x: 0, y: 0 },
      data: { name: n.id, config: {} },
    })),
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
    })),
  };
}

/** Simple runner that captures execution order and resolves with given data */
function makePassthroughRunner(
  log: string[],
  tag: string,
  overrideResult?: Partial<NodeResult>,
): NodeRunner {
  return {
    async execute(ctx: NodeContext): Promise<NodeResult> {
      log.push(tag);
      return { data: ctx.inputs.main[0], ...overrideResult };
    },
  };
}

function makeFailingRunner(log: string[], tag: string, errorMsg: string): NodeRunner {
  return {
    async execute(): Promise<NodeResult> {
      log.push(tag);
      throw new Error(errorMsg);
    },
  };
}

// ── Tests ──────────────────────────────────────────────

describe('ExecutionRunner integration', () => {
  beforeEach(() => {
    insertCounter = 0;
    vi.clearAllMocks();
    // Re-chain after clearAllMocks
    for (const key of Object.keys(mockDb)) {
      const fn = mockDb[key as keyof typeof mockDb];
      if (typeof fn === 'function' && key !== 'get') {
        (fn as ReturnType<typeof vi.fn>).mockReturnValue(mockDb);
      }
    }
    mockDb.get.mockImplementation(() => ({ id: `row-${++insertCounter}` }));

    // Clear registry
    for (const key of Object.keys(testRegistry)) {
      delete testRegistry[key];
    }
  });

  it('executes a linear 3-node workflow in order', async () => {
    const log: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['code'] = makePassthroughRunner(log, 'code');
    testRegistry['set'] = makePassthroughRunner(log, 'set');

    const def = buildDefinition(
      [
        { id: 'n1', type: 'manual-trigger' },
        { id: 'n2', type: 'code' },
        { id: 'n3', type: 'set' },
      ],
      [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
      ],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', { start: true });
    const result = await runner.execute();

    expect(result.status).toBe('completed');
    expect(log).toEqual(['trigger', 'code', 'set']);
  });

  it('follows true branch of if-node (outputIndex 0)', async () => {
    const log: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['if'] = {
      async execute(ctx: NodeContext): Promise<NodeResult> {
        log.push('if');
        return { data: ctx.inputs.main[0], outputIndex: 0 };
      },
    };
    testRegistry['code'] = makePassthroughRunner(log, 'true-branch');
    testRegistry['set'] = makePassthroughRunner(log, 'false-branch');

    const def = buildDefinition(
      [
        { id: 'trigger', type: 'manual-trigger' },
        { id: 'if1', type: 'if' },
        { id: 'onTrue', type: 'code' },
        { id: 'onFalse', type: 'set' },
      ],
      [
        { source: 'trigger', target: 'if1' },
        { source: 'if1', target: 'onTrue', sourceHandle: 'output_0' },
        { source: 'if1', target: 'onFalse', sourceHandle: 'output_1' },
      ],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {});
    const result = await runner.execute();

    expect(result.status).toBe('completed');
    expect(log).toEqual(['trigger', 'if', 'true-branch']);
    expect(log).not.toContain('false-branch');
  });

  it('follows false branch of if-node (outputIndex 1)', async () => {
    const log: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['if'] = {
      async execute(ctx: NodeContext): Promise<NodeResult> {
        log.push('if');
        return { data: ctx.inputs.main[0], outputIndex: 1 };
      },
    };
    testRegistry['code'] = makePassthroughRunner(log, 'true-branch');
    testRegistry['set'] = makePassthroughRunner(log, 'false-branch');

    const def = buildDefinition(
      [
        { id: 'trigger', type: 'manual-trigger' },
        { id: 'if1', type: 'if' },
        { id: 'onTrue', type: 'code' },
        { id: 'onFalse', type: 'set' },
      ],
      [
        { source: 'trigger', target: 'if1' },
        { source: 'if1', target: 'onTrue', sourceHandle: 'output_0' },
        { source: 'if1', target: 'onFalse', sourceHandle: 'output_1' },
      ],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {});
    const result = await runner.execute();

    expect(result.status).toBe('completed');
    expect(log).toEqual(['trigger', 'if', 'false-branch']);
    expect(log).not.toContain('true-branch');
  });

  it('stops on node error with default errorHandling', async () => {
    const log: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['code'] = makeFailingRunner(log, 'code', 'boom');
    testRegistry['set'] = makePassthroughRunner(log, 'set');

    const def = buildDefinition(
      [
        { id: 'n1', type: 'manual-trigger' },
        { id: 'n2', type: 'code' },
        { id: 'n3', type: 'set' },
      ],
      [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
      ],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {});
    const result = await runner.execute();

    expect(result.status).toBe('failed');
    expect(result.error).toContain('boom');
    expect(log).toEqual(['trigger', 'code']);
    expect(log).not.toContain('set');
  });

  it('continues past failed node with errorHandling=continue', async () => {
    const log: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['code'] = makeFailingRunner(log, 'code-fail', 'boom');
    testRegistry['set'] = makePassthroughRunner(log, 'set');

    // Parallel branches: trigger -> code (fails), trigger -> set (succeeds)
    const def = buildDefinition(
      [
        { id: 'n1', type: 'manual-trigger' },
        { id: 'n2', type: 'code' },
        { id: 'n3', type: 'set' },
      ],
      [
        { source: 'n1', target: 'n2' },
        { source: 'n1', target: 'n3' },
      ],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {}, { errorHandling: 'continue' });
    const result = await runner.execute();

    expect(result.status).toBe('completed');
    expect(log).toContain('trigger');
    expect(log).toContain('code-fail');
    expect(log).toContain('set');
  });

  it('retries a failing node before giving up', async () => {
    const log: string[] = [];
    let callCount = 0;
    testRegistry['manual-trigger'] = makePassthroughRunner(log, 'trigger');
    testRegistry['code'] = {
      async execute(ctx: NodeContext): Promise<NodeResult> {
        callCount++;
        log.push(`code-attempt-${callCount}`);
        if (callCount < 3) throw new Error('transient');
        return { data: ctx.inputs.main[0] };
      },
    };

    const def = buildDefinition(
      [
        { id: 'n1', type: 'manual-trigger' },
        { id: 'n2', type: 'code' },
      ],
      [{ source: 'n1', target: 'n2' }],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {}, {
      retryOnFail: true,
      maxRetries: 2, // 1 initial + 2 retries = 3 attempts
    });
    const result = await runner.execute();

    expect(result.status).toBe('completed');
    expect(log).toEqual(['trigger', 'code-attempt-1', 'code-attempt-2', 'code-attempt-3']);
  });

  it('emits execution lifecycle events', async () => {
    const events: string[] = [];
    testRegistry['manual-trigger'] = makePassthroughRunner([], 'trigger');
    testRegistry['code'] = makePassthroughRunner([], 'code');

    const def = buildDefinition(
      [
        { id: 'n1', type: 'manual-trigger' },
        { id: 'n2', type: 'code' },
      ],
      [{ source: 'n1', target: 'n2' }],
    );

    const runner = new ExecutionRunner('wf-1', def, 'manual', {});
    runner.on('execution:started', () => events.push('started'));
    runner.on('execution:node:started', (d) => events.push(`node:started:${d.nodeId}`));
    runner.on('execution:node:completed', (d) => events.push(`node:completed:${d.nodeId}`));
    runner.on('execution:completed', () => events.push('completed'));

    await runner.execute();

    expect(events).toEqual([
      'started',
      'node:started:n1',
      'node:completed:n1',
      'node:started:n2',
      'node:completed:n2',
      'completed',
    ]);
  });
});
