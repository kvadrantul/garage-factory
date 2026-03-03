import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from '../executor/state-manager.js';

describe('StateManager', () => {
  let state: StateManager;

  beforeEach(() => {
    state = new StateManager();
  });

  describe('node results', () => {
    it('stores and retrieves a node result', () => {
      const result = { data: { message: 'hello' } };
      state.setNodeResult('node1', result);
      expect(state.getNodeResult('node1')).toEqual(result);
    });

    it('returns undefined for unknown node', () => {
      expect(state.getNodeResult('unknown')).toBeUndefined();
    });

    it('marks node as executed when setting result', () => {
      state.setNodeResult('node1', { data: {} });
      expect(state.isExecuted('node1')).toBe(true);
    });
  });

  describe('output indices', () => {
    it('stores and retrieves output index', () => {
      state.setOutputIndex('if1', 1);
      expect(state.getOutputIndex('if1')).toBe(1);
    });

    it('returns undefined for unknown node', () => {
      expect(state.getOutputIndex('unknown')).toBeUndefined();
    });
  });

  describe('execution tracking', () => {
    it('reports unexecuted nodes correctly', () => {
      expect(state.isExecuted('node1')).toBe(false);
    });

    it('tracks multiple executed nodes', () => {
      state.setNodeResult('a', { data: 1 });
      state.setNodeResult('b', { data: 2 });
      expect(state.isExecuted('a')).toBe(true);
      expect(state.isExecuted('b')).toBe(true);
      expect(state.isExecuted('c')).toBe(false);
    });
  });

  describe('failed nodes', () => {
    it('marks a node as failed', () => {
      state.markFailed('node1');
      expect(state.isFailed('node1')).toBe(true);
    });

    it('marking failed also marks as executed', () => {
      state.markFailed('node1');
      expect(state.isExecuted('node1')).toBe(true);
    });

    it('non-failed nodes return false', () => {
      expect(state.isFailed('node1')).toBe(false);
    });

    it('a normally executed node is not failed', () => {
      state.setNodeResult('node1', { data: {} });
      expect(state.isFailed('node1')).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      state.setNodeResult('a', { data: 1 });
      state.setOutputIndex('a', 0);
      state.markFailed('b');

      state.reset();

      expect(state.getNodeResult('a')).toBeUndefined();
      expect(state.getOutputIndex('a')).toBeUndefined();
      expect(state.isExecuted('a')).toBe(false);
      expect(state.isExecuted('b')).toBe(false);
      expect(state.isFailed('b')).toBe(false);
    });
  });
});
