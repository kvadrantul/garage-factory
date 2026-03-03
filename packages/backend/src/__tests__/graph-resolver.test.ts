import { describe, it, expect } from 'vitest';
import { GraphResolver } from '../executor/graph-resolver.js';
import type { WorkflowDefinition } from '@garage-engine/shared';

function makeDefinition(
  nodes: { id: string }[],
  edges: { source: string; target: string; sourceHandle?: string }[],
): WorkflowDefinition {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: 'code' as const,
      position: { x: 0, y: 0 },
      data: { config: {} },
    })),
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
    })),
  };
}

describe('GraphResolver', () => {
  describe('getStartNodes', () => {
    it('returns nodes with no incoming edges', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getStartNodes()).toEqual(['a']);
    });

    it('returns multiple start nodes when several have no inputs', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'c' }, { source: 'b', target: 'c' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getStartNodes()).toEqual(['a', 'b']);
    });

    it('returns all nodes when there are no edges', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [],
      );
      const graph = new GraphResolver(def);
      expect(graph.getStartNodes()).toEqual(['a', 'b']);
    });

    it('returns empty array for a cycle with no pure start', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getStartNodes()).toEqual([]);
    });
  });

  describe('getExecutionOrder', () => {
    it('returns topologically sorted order for a linear chain', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getExecutionOrder()).toEqual(['a', 'b', 'c']);
    });

    it('returns valid order for a diamond graph', () => {
      // a -> b, a -> c, b -> d, c -> d
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'c' },
          { source: 'b', target: 'd' },
          { source: 'c', target: 'd' },
        ],
      );
      const graph = new GraphResolver(def);
      const order = graph.getExecutionOrder();

      // a must come before b, c; b and c must come before d
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
    });

    it('handles a single node', () => {
      const def = makeDefinition([{ id: 'only' }], []);
      const graph = new GraphResolver(def);
      expect(graph.getExecutionOrder()).toEqual(['only']);
    });

    it('includes all nodes even when disconnected', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'b' }],
      );
      const graph = new GraphResolver(def);
      const order = graph.getExecutionOrder();
      expect(order).toHaveLength(3);
      expect(order).toContain('a');
      expect(order).toContain('b');
      expect(order).toContain('c');
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    });
  });

  describe('getDownstreamNodes', () => {
    it('returns direct downstream nodes', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getDownstreamNodes('a')).toEqual(['b', 'c']);
    });

    it('returns empty array for leaf node', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [{ source: 'a', target: 'b' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getDownstreamNodes('b')).toEqual([]);
    });
  });

  describe('getNodeInputs', () => {
    it('returns upstream nodes', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        [{ source: 'a', target: 'c' }, { source: 'b', target: 'c' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getNodeInputs('c')).toEqual(['a', 'b']);
    });

    it('returns empty array for start node', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [{ source: 'a', target: 'b' }],
      );
      const graph = new GraphResolver(def);
      expect(graph.getNodeInputs('a')).toEqual([]);
    });
  });

  describe('getEdge', () => {
    it('returns the edge between two connected nodes', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [{ source: 'a', target: 'b', sourceHandle: 'out-0' }],
      );
      const graph = new GraphResolver(def);
      const edge = graph.getEdge('a', 'b');
      expect(edge).toBeDefined();
      expect(edge!.source).toBe('a');
      expect(edge!.target).toBe('b');
      expect(edge!.sourceHandle).toBe('out-0');
    });

    it('returns undefined for unconnected nodes', () => {
      const def = makeDefinition(
        [{ id: 'a' }, { id: 'b' }],
        [],
      );
      const graph = new GraphResolver(def);
      expect(graph.getEdge('a', 'b')).toBeUndefined();
    });
  });
});
