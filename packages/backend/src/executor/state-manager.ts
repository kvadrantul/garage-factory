import type { NodeResult } from '@garage-engine/shared';

export class StateManager {
  private nodeResults: Map<string, NodeResult>;
  private outputIndices: Map<string, number>;
  private executedNodes: Set<string>;
  private failedNodes: Set<string>;

  constructor() {
    this.nodeResults = new Map();
    this.outputIndices = new Map();
    this.executedNodes = new Set();
    this.failedNodes = new Set();
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

  markFailed(nodeId: string): void {
    this.failedNodes.add(nodeId);
    this.executedNodes.add(nodeId);
  }

  isFailed(nodeId: string): boolean {
    return this.failedNodes.has(nodeId);
  }

  /**
   * Get all node results as a map of nodeName -> output data.
   * Used for $node["name"] expression resolution.
   */
  getAllNodeResults(): Record<string, unknown> {
    const results: Record<string, unknown> = {};
    for (const [nodeId, result] of this.nodeResults) {
      results[nodeId] = result.data;
    }
    return results;
  }

  reset(): void {
    this.nodeResults.clear();
    this.outputIndices.clear();
    this.executedNodes.clear();
    this.failedNodes.clear();
  }
}
