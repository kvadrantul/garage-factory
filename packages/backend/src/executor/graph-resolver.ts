import type { WorkflowDefinition, WorkflowEdge } from '@garage-engine/shared';

export class GraphResolver {
  private adjacencyList: Map<string, string[]>;
  private reverseAdjacencyList: Map<string, string[]>;

  constructor(private definition: WorkflowDefinition) {
    this.adjacencyList = new Map();
    this.reverseAdjacencyList = new Map();
    this.buildGraph();
  }

  private buildGraph(): void {
    for (const node of this.definition.nodes) {
      this.adjacencyList.set(node.id, []);
      this.reverseAdjacencyList.set(node.id, []);
    }

    for (const edge of this.definition.edges) {
      this.adjacencyList.get(edge.source)?.push(edge.target);
      this.reverseAdjacencyList.get(edge.target)?.push(edge.source);
    }
  }

  getStartNodes(): string[] {
    return this.definition.nodes
      .filter((node) => {
        const inputs = this.reverseAdjacencyList.get(node.id) || [];
        return inputs.length === 0;
      })
      .map((node) => node.id);
  }

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

  getNodeInputs(nodeId: string): string[] {
    return this.reverseAdjacencyList.get(nodeId) || [];
  }

  getDownstreamNodes(nodeId: string): string[] {
    return this.adjacencyList.get(nodeId) || [];
  }

  getEdge(sourceId: string, targetId: string): WorkflowEdge | undefined {
    return this.definition.edges.find(
      (e) => e.source === sourceId && e.target === targetId,
    );
  }
}
