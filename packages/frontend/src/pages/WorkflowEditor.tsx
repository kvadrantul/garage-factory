// Workflow Editor Page

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Save, Play, ArrowLeft } from 'lucide-react';
import { workflowsApi } from '@/api/client';
import { useWorkflowStore } from '@/stores/workflowStore';
import { NodePalette } from '@/components/canvas/NodePalette';
import { NodeConfigPanel } from '@/components/panels/NodeConfigPanel';
import { HITLPanel } from '@/components/panels/HITLPanel';
import { WorkflowNode } from '@/components/nodes/WorkflowNode';
import { useWebSocket } from '@/hooks/useWebSocket';

interface HITLRequest {
  id: string;
  executionId: string;
  nodeId: string;
  type: 'approval' | 'input' | 'selection';
  status: string;
  requestData: {
    type: string;
    message: string;
    details?: string;
    fields?: Array<{ name: string; label: string; type: string; required?: boolean }>;
    options?: Array<{ label: string; value: string }>;
    timeoutSeconds?: number;
  };
  expiresAt?: string;
  createdAt: string;
}

const allNodeTypes = [
  'webhook-trigger', 'schedule-trigger', 'manual-trigger',
  'http-request', 'code', 'set',
  'if', 'switch', 'merge',
  'agent', 'hitl',
];

export function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [hitlRequest, setHitlRequest] = useState<HITLRequest | null>(null);

  // Register all node types to use the same custom component
  const nodeTypes = useMemo(
    () => Object.fromEntries(allNodeTypes.map((t) => [t, WorkflowNode])),
    [],
  );

  const {
    name,
    nodes: storeNodes,
    edges: storeEdges,
    isDirty,
    selectedNode,
    setWorkflow,
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    setSelectedNode,
    setName,
    markClean,
    reset,
  } = useWorkflowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);

  // WebSocket for real-time execution updates
  const wsMessageHandler = useCallback(
    (event: { type: string; payload: Record<string, unknown> }) => {
      const { type, payload } = event;

      if (type === 'execution:node:started') {
        const nodeId = payload.nodeId as string;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    executionStatus: 'running',
                    executionStartTime: Date.now(),
                  },
                }
              : n,
          ),
        );
      }

      if (type === 'execution:node:completed') {
        const nodeId = payload.nodeId as string;
        const output = payload.output;
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const startTime = n.data.executionStartTime as number | undefined;
            const duration = startTime ? Date.now() - startTime : undefined;
            return {
              ...n,
              data: {
                ...n.data,
                executionStatus: 'completed',
                executionOutput: output,
                executionDuration: duration,
              },
            };
          }),
        );
        // Animate the edge from this node
        setEdges((eds) =>
          eds.map((e) =>
            e.source === nodeId
              ? { ...e, animated: true, style: { stroke: '#22c55e' } }
              : e,
          ),
        );
      }

      if (type === 'execution:node:error') {
        const nodeId = payload.nodeId as string;
        const error = payload.error;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    executionStatus: 'error',
                    executionError: error,
                  },
                }
              : n,
          ),
        );
        setEdges((eds) =>
          eds.map((e) =>
            e.source === nodeId
              ? { ...e, animated: false, style: { stroke: '#ef4444' } }
              : e,
          ),
        );
      }

      // Handle HITL required
      if (type === 'hitl:required') {
        const nodeId = payload.nodeId as string;
        setNodes((nds) =>
          nds.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, executionStatus: 'waiting_hitl' } }
              : n,
          ),
        );
        setHitlRequest({
          id: payload.hitlId as string,
          executionId: payload.executionId as string,
          nodeId: payload.nodeId as string,
          type: (payload.requestData as any)?.type || 'approval',
          status: 'pending',
          requestData: payload.requestData as any,
          createdAt: new Date().toISOString(),
        });
      }

      // Handle HITL resolved
      if (type === 'hitl:resolved') {
        setHitlRequest(null);
      }

      if (type === 'execution:completed' || type === 'execution:failed') {
        setExecutionId(null);
        setHitlRequest(null);
      }
    },
    [setNodes, setEdges],
  );

  const { subscribe, unsubscribe } = useWebSocket(wsMessageHandler);

  // Cleanup subscription on unmount or execution change
  useEffect(() => {
    return () => {
      if (executionId) unsubscribe(executionId);
    };
  }, [executionId, unsubscribe]);

  // Sync React Flow state with store
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    setStoreEdges(edges);
  }, [edges, setStoreEdges]);

  // Load workflow
  const { data: workflow, isLoading } = useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowsApi.get(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (workflow) {
      setWorkflow(workflow.id, workflow.name, workflow.definition);
      setNodes(
        workflow.definition.nodes.map((n: any) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
      );
      setEdges(workflow.definition.edges);
    } else if (isNew) {
      reset();
    }
  }, [workflow, isNew, setWorkflow, setNodes, setEdges, reset]);

  // Save workflow
  const saveMutation = useMutation({
    mutationFn: async () => {
      const definition = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
        })),
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        })),
      };

      if (isNew) {
        const result = await workflowsApi.create({ name, definition });
        navigate(`/workflows/${result.id}`, { replace: true });
        return result;
      } else {
        return workflowsApi.update(id!, { name, definition });
      }
    },
    onSuccess: () => markClean(),
  });

  // Execute workflow
  const executeMutation = useMutation({
    mutationFn: () => workflowsApi.execute(id!),
    onSuccess: (result: any) => {
      // Clear previous execution status from nodes
      setNodes((nds) =>
        nds.map((n) => ({ ...n, data: { ...n.data, executionStatus: 'pending' } })),
      );
      // Subscribe to execution events
      const execId = result.executionId;
      setExecutionId(execId);
      subscribe(execId);
    },
  });

  // Connection handler
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges],
  );

  // Node click handler
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id);
    },
    [setSelectedNode],
  );

  // Pane click (deselect)
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  // Drag and drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = {
        x: event.clientX - 250,
        y: event.clientY - 100,
      };

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type,
        position,
        data: { name: type, config: {} },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Toolbar */}
      <header className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 hover:bg-gray-100 rounded"
          >
            <ArrowLeft size={20} />
          </button>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-lg font-medium border-none focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
            placeholder="Workflow name"
          />
          {isDirty && <span className="text-xs text-gray-400">Unsaved changes</span>}
        </div>

        <div className="flex items-center gap-2">
          {executionId && (
            <span className="text-xs text-blue-500 animate-pulse mr-2">Running...</span>
          )}
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <Save size={16} />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </button>
          {!isNew && (
            <button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || isDirty || !!executionId}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              <Play size={16} />
              Run
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Node Palette */}
        <NodePalette />

        {/* Canvas */}
        <div className="flex-1" onDragOver={onDragOver} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Config Panel */}
        {selectedNode && <NodeConfigPanel />}
      </div>

      {/* HITL Panel */}
      {hitlRequest && (
        <HITLPanel
          request={hitlRequest}
          onResolved={() => setHitlRequest(null)}
        />
      )}
    </div>
  );
}
