// Workflow Store using Zustand

import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';
import type { WorkflowDefinition } from '@garage-engine/shared';

interface WorkflowState {
  // Workflow data
  id: string | null;
  name: string;
  nodes: Node[];
  edges: Edge[];

  // UI state
  selectedNode: string | null;
  isDirty: boolean;

  // Actions
  setWorkflow: (id: string | null, name: string, definition: WorkflowDefinition) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  setSelectedNode: (nodeId: string | null) => void;
  setName: (name: string) => void;
  markClean: () => void;
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  id: null,
  name: 'Untitled Workflow',
  nodes: [],
  edges: [],
  selectedNode: null,
  isDirty: false,

  setWorkflow: (id, name, definition) =>
    set({
      id,
      name,
      nodes: definition.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      })),
      edges: definition.edges.map((e) => ({
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle,
        target: e.target,
        targetHandle: e.targetHandle,
      })),
      isDirty: false,
    }),

  setNodes: (nodes) => set({ nodes, isDirty: true }),

  setEdges: (edges) => set({ edges, isDirty: true }),

  addNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, node],
      isDirty: true,
    })),

  removeNode: (nodeId) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNode: state.selectedNode === nodeId ? null : state.selectedNode,
      isDirty: true,
    })),

  updateNodeData: (nodeId, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)),
      isDirty: true,
    })),

  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),

  setName: (name) => set({ name, isDirty: true }),

  markClean: () => set({ isDirty: false }),

  reset: () =>
    set({
      id: null,
      name: 'Untitled Workflow',
      nodes: [],
      edges: [],
      selectedNode: null,
      isDirty: false,
    }),
}));
