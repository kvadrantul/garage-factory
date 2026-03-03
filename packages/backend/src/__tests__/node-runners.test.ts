import { describe, it, expect } from 'vitest';
import { ifNode } from '../nodes/logic/if.js';
import { switchNode } from '../nodes/logic/switch.js';
import { mergeNode } from '../nodes/logic/merge.js';
import { setNode } from '../nodes/actions/set.js';
import type { NodeContext, WorkflowNode } from '@orchestrator/shared';

function makeContext(
  config: Record<string, unknown>,
  inputs: unknown[],
  nodeType = 'code' as const,
): NodeContext {
  const node: WorkflowNode = {
    id: 'test-node',
    type: nodeType,
    position: { x: 0, y: 0 },
    data: { name: 'Test', config },
  };
  return {
    node,
    inputs: { main: inputs },
    execution: { id: 'exec-1', workflowId: 'wf-1' },
    helpers: {
      httpRequest: async () => ({ statusCode: 200, headers: {}, body: {} }),
      getCredential: async () => ({}),
    },
    emit: () => {},
  };
}

// ============================================
// IF NODE
// ============================================

describe('ifNode', () => {
  describe('equals operation', () => {
    it('returns outputIndex 0 when condition passes', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'status', operation: 'equals', value: 'active' }] },
        [{ status: 'active' }],
      );
      const result = await ifNode.execute(ctx);
      expect(result.outputIndex).toBe(0);
    });

    it('returns outputIndex 1 when condition fails', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'status', operation: 'equals', value: 'active' }] },
        [{ status: 'inactive' }],
      );
      const result = await ifNode.execute(ctx);
      expect(result.outputIndex).toBe(1);
    });
  });

  describe('notEquals operation', () => {
    it('passes when values differ', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'x', operation: 'notEquals', value: 1 }] },
        [{ x: 2 }],
      );
      const result = await ifNode.execute(ctx);
      expect(result.outputIndex).toBe(0);
    });
  });

  describe('contains operation', () => {
    it('passes when string contains substring', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'name', operation: 'contains', value: 'ohn' }] },
        [{ name: 'John Doe' }],
      );
      const result = await ifNode.execute(ctx);
      expect(result.outputIndex).toBe(0);
    });

    it('fails for non-string fields', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'count', operation: 'contains', value: '5' }] },
        [{ count: 5 }],
      );
      const result = await ifNode.execute(ctx);
      expect(result.outputIndex).toBe(1);
    });
  });

  describe('numeric comparisons', () => {
    it('gt passes when greater', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'gt', value: 5 }] },
        [{ val: 10 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('lt passes when less', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'lt', value: 10 }] },
        [{ val: 5 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('gte passes on equal', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'gte', value: 5 }] },
        [{ val: 5 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('lte passes on equal', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'lte', value: 5 }] },
        [{ val: 5 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });
  });

  describe('isEmpty / isNotEmpty', () => {
    it('isEmpty passes for null', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'isEmpty', value: null }] },
        [{ val: null }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('isEmpty passes for empty string', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'val', operation: 'isEmpty', value: null }] },
        [{ val: '' }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('isEmpty passes for empty array', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'items', operation: 'isEmpty', value: null }] },
        [{ items: [] }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('isNotEmpty passes for non-empty string', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'name', operation: 'isNotEmpty', value: null }] },
        [{ name: 'test' }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });
  });

  describe('nested field access', () => {
    it('reads nested object properties', async () => {
      const ctx = makeContext(
        { conditions: [{ field: 'user.role', operation: 'equals', value: 'admin' }] },
        [{ user: { role: 'admin' } }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });
  });

  describe('combineOperation', () => {
    it('AND requires all conditions to pass', async () => {
      const ctx = makeContext(
        {
          conditions: [
            { field: 'a', operation: 'equals', value: 1 },
            { field: 'b', operation: 'equals', value: 2 },
          ],
          combineOperation: 'AND',
        },
        [{ a: 1, b: 2 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('AND fails if any condition fails', async () => {
      const ctx = makeContext(
        {
          conditions: [
            { field: 'a', operation: 'equals', value: 1 },
            { field: 'b', operation: 'equals', value: 99 },
          ],
          combineOperation: 'AND',
        },
        [{ a: 1, b: 2 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(1);
    });

    it('OR passes if any condition passes', async () => {
      const ctx = makeContext(
        {
          conditions: [
            { field: 'a', operation: 'equals', value: 99 },
            { field: 'b', operation: 'equals', value: 2 },
          ],
          combineOperation: 'OR',
        },
        [{ a: 1, b: 2 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(0);
    });

    it('OR fails when all conditions fail', async () => {
      const ctx = makeContext(
        {
          conditions: [
            { field: 'a', operation: 'equals', value: 99 },
            { field: 'b', operation: 'equals', value: 99 },
          ],
          combineOperation: 'OR',
        },
        [{ a: 1, b: 2 }],
      );
      expect((await ifNode.execute(ctx)).outputIndex).toBe(1);
    });
  });
});

// ============================================
// SWITCH NODE
// ============================================

describe('switchNode', () => {
  it('returns index of matching case', async () => {
    const ctx = makeContext(
      {
        value: 'status',
        cases: [
          { value: 'pending', label: 'Pending' },
          { value: 'active', label: 'Active' },
          { value: 'closed', label: 'Closed' },
        ],
      },
      [{ status: 'active' }],
    );
    const result = await switchNode.execute(ctx);
    expect(result.outputIndex).toBe(1);
  });

  it('returns first case index (0) when first matches', async () => {
    const ctx = makeContext(
      {
        value: 'type',
        cases: [
          { value: 'email', label: 'Email' },
          { value: 'sms', label: 'SMS' },
        ],
      },
      [{ type: 'email' }],
    );
    const result = await switchNode.execute(ctx);
    expect(result.outputIndex).toBe(0);
  });

  it('returns fallback index when no case matches and fallback is true', async () => {
    const ctx = makeContext(
      {
        value: 'status',
        cases: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        fallback: true,
      },
      [{ status: 'z' }],
    );
    const result = await switchNode.execute(ctx);
    expect(result.outputIndex).toBe(2); // cases.length
  });

  it('returns 0 when no case matches and no fallback', async () => {
    const ctx = makeContext(
      {
        value: 'status',
        cases: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
      [{ status: 'z' }],
    );
    const result = await switchNode.execute(ctx);
    expect(result.outputIndex).toBe(0);
  });

  it('supports nested value path', async () => {
    const ctx = makeContext(
      {
        value: 'data.level',
        cases: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ],
      },
      [{ data: { level: 'high' } }],
    );
    const result = await switchNode.execute(ctx);
    expect(result.outputIndex).toBe(1);
  });

  it('passes input data through', async () => {
    const input = { status: 'active', name: 'test' };
    const ctx = makeContext(
      { value: 'status', cases: [{ value: 'active', label: 'Active' }] },
      [input],
    );
    const result = await switchNode.execute(ctx);
    expect(result.data).toEqual(input);
  });
});

// ============================================
// SET NODE
// ============================================

describe('setNode', () => {
  describe('set mode (default)', () => {
    it('merges values into input', async () => {
      const ctx = makeContext(
        { values: { color: 'red' } },
        [{ name: 'item' }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ name: 'item', color: 'red' });
    });

    it('overwrites existing keys', async () => {
      const ctx = makeContext(
        { values: { name: 'new' }, mode: 'set' },
        [{ name: 'old', keep: true }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ name: 'new', keep: true });
    });

    it('keepOnlySet discards original input keys', async () => {
      const ctx = makeContext(
        { values: { a: 1 }, mode: 'set', keepOnlySet: true },
        [{ a: 0, b: 2 }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ a: 1 });
    });
  });

  describe('remove mode', () => {
    it('removes specified keys from input', async () => {
      const ctx = makeContext(
        { values: { secret: null }, mode: 'remove' },
        [{ name: 'test', secret: '123' }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ name: 'test' });
    });
  });

  describe('append mode', () => {
    it('appends to existing array', async () => {
      const ctx = makeContext(
        { values: { tags: 'new' }, mode: 'append' },
        [{ tags: ['old'] }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ tags: ['old', 'new'] });
    });

    it('sets value if key is not an array', async () => {
      const ctx = makeContext(
        { values: { count: 5 }, mode: 'append' },
        [{ count: 3 }],
      );
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ count: 5 });
    });
  });

  describe('edge cases', () => {
    it('handles null input gracefully', async () => {
      const ctx = makeContext({ values: { a: 1 } }, [null]);
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ a: 1 });
    });

    it('handles missing values config', async () => {
      const ctx = makeContext({ mode: 'set' }, [{ x: 1 }]);
      const result = await setNode.execute(ctx);
      expect(result.data).toEqual({ x: 1 });
    });
  });
});

// ============================================
// MERGE NODE
// ============================================

describe('mergeNode', () => {
  describe('append mode (default)', () => {
    it('flattens inputs into array', async () => {
      const ctx = makeContext({}, [{ a: 1 }, { b: 2 }]);
      const result = await mergeNode.execute(ctx);
      expect(result.data).toEqual([{ a: 1 }, { b: 2 }]);
    });

    it('flattens nested arrays', async () => {
      const ctx = makeContext({ mode: 'append' }, [[1, 2], [3, 4]]);
      const result = await mergeNode.execute(ctx);
      expect(result.data).toEqual([1, 2, 3, 4]);
    });
  });

  describe('combine mode', () => {
    it('deep-merges objects', async () => {
      const ctx = makeContext(
        { mode: 'combine' },
        [{ a: 1 }, { b: 2 }, { c: 3 }],
      );
      const result = await mergeNode.execute(ctx);
      expect(result.data).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('later objects overwrite earlier keys', async () => {
      const ctx = makeContext(
        { mode: 'combine' },
        [{ a: 1, b: 'old' }, { b: 'new', c: 3 }],
      );
      const result = await mergeNode.execute(ctx);
      expect(result.data).toEqual({ a: 1, b: 'new', c: 3 });
    });

    it('skips non-object inputs', async () => {
      const ctx = makeContext(
        { mode: 'combine' },
        [{ a: 1 }, 'not-an-object', { b: 2 }],
      );
      const result = await mergeNode.execute(ctx);
      expect(result.data).toEqual({ a: 1, b: 2 });
    });
  });
});
