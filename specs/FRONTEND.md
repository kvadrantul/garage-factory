# Frontend Specification

## Tech Stack

| Technology | Purpose |
|------------|---------|
| React 18+ | UI framework |
| TypeScript | Type safety |
| React Flow | Canvas/graph editor |
| Zustand | State management |
| TanStack Query | Server state |
| TailwindCSS | Styling |
| Radix UI | Accessible components |
| Vite | Build tool |

## Project Structure

```
packages/frontend/
├── src/
│   ├── components/
│   │   ├── canvas/           # Canvas editor components
│   │   │   ├── Canvas.tsx
│   │   │   ├── CustomNode.tsx
│   │   │   ├── CustomEdge.tsx
│   │   │   └── NodePalette.tsx
│   │   │
│   │   ├── nodes/            # Node-specific components
│   │   │   ├── WebhookNode.tsx
│   │   │   ├── HttpRequestNode.tsx
│   │   │   ├── CodeNode.tsx
│   │   │   ├── IfNode.tsx
│   │   │   ├── AgentNode.tsx
│   │   │   └── HitlNode.tsx
│   │   │
│   │   ├── panels/           # Side panels
│   │   │   ├── NodeConfigPanel.tsx
│   │   │   ├── ExecutionPanel.tsx
│   │   │   └── PropertiesPanel.tsx
│   │   │
│   │   ├── hitl/             # HITL widgets
│   │   │   ├── HitlModal.tsx
│   │   │   ├── ApprovalCard.tsx
│   │   │   └── InputForm.tsx
│   │   │
│   │   ├── execution/        # Execution visualization
│   │   │   ├── ExecutionOverlay.tsx
│   │   │   ├── NodeStatus.tsx
│   │   │   └── ExecutionTimeline.tsx
│   │   │
│   │   └── ui/               # Base UI components
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       ├── Select.tsx
│   │       └── ...
│   │
│   ├── hooks/
│   │   ├── useWorkflow.ts
│   │   ├── useExecution.ts
│   │   ├── useWebSocket.ts
│   │   └── useHitl.ts
│   │
│   ├── stores/
│   │   ├── workflowStore.ts
│   │   ├── executionStore.ts
│   │   └── uiStore.ts
│   │
│   ├── api/
│   │   ├── client.ts
│   │   ├── workflows.ts
│   │   ├── executions.ts
│   │   └── credentials.ts
│   │
│   ├── lib/
│   │   ├── utils.ts
│   │   └── expressions.ts
│   │
│   ├── types/
│   │   └── index.ts
│   │
│   ├── pages/
│   │   ├── WorkflowEditor.tsx
│   │   ├── WorkflowList.tsx
│   │   ├── ExecutionHistory.tsx
│   │   └── Settings.tsx
│   │
│   ├── App.tsx
│   └── main.tsx
│
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## Core Components

### 1. Canvas Editor

```tsx
// components/canvas/Canvas.tsx
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
} from 'reactflow';
import { useWorkflowStore } from '@/stores/workflowStore';
import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';

const nodeTypes = {
  'webhook-trigger': WebhookNode,
  'schedule-trigger': ScheduleNode,
  'manual-trigger': ManualNode,
  'http-request': HttpRequestNode,
  'code': CodeNode,
  'if': IfNode,
  'switch': SwitchNode,
  'merge': MergeNode,
  'agent': AgentNode,
  'hitl': HitlNode,
};

const edgeTypes = {
  default: CustomEdge,
};

export function Canvas() {
  const { nodes, edges, setNodes, setEdges, selectedNode, setSelectedNode } = useWorkflowStore();
  
  const onNodesChange = useCallback((changes) => {
    setNodes(applyNodeChanges(changes, nodes));
  }, [nodes, setNodes]);
  
  const onEdgesChange = useCallback((changes) => {
    setEdges(applyEdgeChanges(changes, edges));
  }, [edges, setEdges]);
  
  const onConnect = useCallback((connection: Connection) => {
    setEdges(addEdge(connection, edges));
  }, [edges, setEdges]);
  
  const onNodeClick = useCallback((_, node: Node) => {
    setSelectedNode(node.id);
  }, [setSelectedNode]);
  
  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

### 2. Custom Node Component

```tsx
// components/canvas/CustomNode.tsx
import { Handle, Position, NodeProps } from 'reactflow';
import { cn } from '@/lib/utils';
import { useExecutionStore } from '@/stores/executionStore';

interface CustomNodeData {
  name: string;
  config: Record<string, any>;
}

export function CustomNode({ id, data, type, selected }: NodeProps<CustomNodeData>) {
  const nodeExecution = useExecutionStore((s) => s.nodeStatuses[id]);
  
  const statusColor = {
    pending: 'bg-gray-200',
    running: 'bg-blue-400 animate-pulse',
    completed: 'bg-green-400',
    error: 'bg-red-400',
    waiting_hitl: 'bg-yellow-400 animate-pulse',
  }[nodeExecution?.status] || 'bg-gray-200';
  
  return (
    <div
      className={cn(
        'px-4 py-2 rounded-lg border-2 bg-white shadow-sm min-w-[150px]',
        selected ? 'border-blue-500' : 'border-gray-200',
        nodeExecution?.status === 'error' && 'border-red-500'
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-400"
      />
      
      {/* Node Content */}
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', statusColor)} />
        <NodeIcon type={type} />
        <span className="font-medium text-sm">{data.name || type}</span>
      </div>
      
      {/* Output Handle(s) */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-400"
      />
    </div>
  );
}
```

### 3. Node Palette

```tsx
// components/canvas/NodePalette.tsx
import { nodeDefinitions } from '@/lib/nodes';

const categories = ['triggers', 'actions', 'logic', 'ai', 'utility'];

export function NodePalette() {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer?.setData('application/reactflow', nodeType);
    event.dataTransfer!.effectAllowed = 'move';
  };
  
  return (
    <div className="w-64 bg-white border-r p-4 overflow-y-auto">
      <h2 className="font-bold mb-4">Nodes</h2>
      
      {categories.map((category) => (
        <div key={category} className="mb-4">
          <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">
            {category}
          </h3>
          
          <div className="space-y-1">
            {nodeDefinitions
              .filter((n) => n.category === category)
              .map((node) => (
                <div
                  key={node.type}
                  className="p-2 bg-gray-50 rounded cursor-grab hover:bg-gray-100"
                  draggable
                  onDragStart={(e) => onDragStart(e, node.type)}
                >
                  <div className="flex items-center gap-2">
                    <NodeIcon type={node.type} />
                    <span className="text-sm">{node.name}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4. Node Configuration Panel

```tsx
// components/panels/NodeConfigPanel.tsx
import { useWorkflowStore } from '@/stores/workflowStore';
import { nodeDefinitions } from '@/lib/nodes';

export function NodeConfigPanel() {
  const { selectedNode, nodes, updateNodeData } = useWorkflowStore();
  
  const node = nodes.find((n) => n.id === selectedNode);
  if (!node) return <EmptyState />;
  
  const definition = nodeDefinitions.find((d) => d.type === node.type);
  if (!definition) return null;
  
  const handleChange = (property: string, value: any) => {
    updateNodeData(node.id, {
      ...node.data,
      config: {
        ...node.data.config,
        [property]: value,
      },
    });
  };
  
  return (
    <div className="w-80 bg-white border-l p-4 overflow-y-auto">
      <h2 className="font-bold mb-4">{definition.name}</h2>
      <p className="text-sm text-gray-500 mb-4">{definition.description}</p>
      
      <div className="space-y-4">
        {/* Node Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <Input
            value={node.data.name || ''}
            onChange={(e) => updateNodeData(node.id, { ...node.data, name: e.target.value })}
            placeholder={definition.name}
          />
        </div>
        
        {/* Dynamic Properties */}
        {definition.properties.map((prop) => (
          <PropertyField
            key={prop.name}
            property={prop}
            value={node.data.config[prop.name]}
            onChange={(value) => handleChange(prop.name, value)}
          />
        ))}
        
        {/* Credentials */}
        {definition.credentials && (
          <CredentialSelector
            types={definition.credentials}
            value={node.data.credentials}
            onChange={(id) => updateNodeData(node.id, { ...node.data, credentials: id })}
          />
        )}
      </div>
    </div>
  );
}
```

### 5. HITL Modal

```tsx
// components/hitl/HitlModal.tsx
import { Dialog } from '@radix-ui/react-dialog';
import { useHitl } from '@/hooks/useHitl';

export function HitlModal() {
  const { pendingRequest, respond, isResponding } = useHitl();
  
  if (!pendingRequest) return null;
  
  return (
    <Dialog open={!!pendingRequest}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Action Required</DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <p className="text-lg font-medium">{pendingRequest.requestData.message}</p>
          {pendingRequest.requestData.details && (
            <p className="text-gray-600 mt-2">{pendingRequest.requestData.details}</p>
          )}
        </div>
        
        {/* Approval Type */}
        {pendingRequest.type === 'approval' && (
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => respond({ action: 'reject' })}
              disabled={isResponding}
            >
              Reject
            </Button>
            <Button
              onClick={() => respond({ action: 'approve' })}
              disabled={isResponding}
            >
              Approve
            </Button>
          </div>
        )}
        
        {/* Input Type */}
        {pendingRequest.type === 'input' && (
          <HitlInputForm
            fields={pendingRequest.requestData.fields}
            onSubmit={(data) => respond({ action: 'submit', data })}
            isSubmitting={isResponding}
          />
        )}
        
        {/* Timeout Indicator */}
        {pendingRequest.expiresAt && (
          <TimeoutCountdown expiresAt={pendingRequest.expiresAt} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

## State Management

### Workflow Store (Zustand)

```typescript
// stores/workflowStore.ts
import { create } from 'zustand';
import { Node, Edge } from 'reactflow';

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
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: any) => void;
  setSelectedNode: (nodeId: string | null) => void;
  
  // Persistence
  loadWorkflow: (id: string) => Promise<void>;
  saveWorkflow: () => Promise<void>;
  createWorkflow: () => Promise<string>;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  id: null,
  name: 'Untitled Workflow',
  nodes: [],
  edges: [],
  selectedNode: null,
  isDirty: false,
  
  setNodes: (nodes) => set({ nodes, isDirty: true }),
  setEdges: (edges) => set({ edges, isDirty: true }),
  
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node],
    isDirty: true,
  })),
  
  removeNode: (nodeId) => set((state) => ({
    nodes: state.nodes.filter((n) => n.id !== nodeId),
    edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    selectedNode: state.selectedNode === nodeId ? null : state.selectedNode,
    isDirty: true,
  })),
  
  updateNodeData: (nodeId, data) => set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, data } : n
    ),
    isDirty: true,
  })),
  
  setSelectedNode: (nodeId) => set({ selectedNode: nodeId }),
  
  loadWorkflow: async (id) => {
    const workflow = await api.workflows.get(id);
    set({
      id: workflow.id,
      name: workflow.name,
      nodes: workflow.definition.nodes,
      edges: workflow.definition.edges,
      isDirty: false,
    });
  },
  
  saveWorkflow: async () => {
    const { id, name, nodes, edges } = get();
    if (id) {
      await api.workflows.update(id, {
        name,
        definition: { nodes, edges },
      });
    }
    set({ isDirty: false });
  },
  
  createWorkflow: async () => {
    const { name, nodes, edges } = get();
    const workflow = await api.workflows.create({
      name,
      definition: { nodes, edges },
    });
    set({ id: workflow.id, isDirty: false });
    return workflow.id;
  },
}));
```

### Execution Store

```typescript
// stores/executionStore.ts
import { create } from 'zustand';

interface ExecutionState {
  currentExecution: string | null;
  status: ExecutionStatus | null;
  nodeStatuses: Record<string, NodeExecutionStatus>;
  
  // HITL
  pendingHitl: HITLRequest | null;
  
  // Actions
  setExecution: (id: string) => void;
  updateNodeStatus: (nodeId: string, status: NodeExecutionStatus) => void;
  setHitlRequest: (request: HITLRequest | null) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  currentExecution: null,
  status: null,
  nodeStatuses: {},
  pendingHitl: null,
  
  setExecution: (id) => set({
    currentExecution: id,
    status: 'running',
    nodeStatuses: {},
  }),
  
  updateNodeStatus: (nodeId, status) => set((state) => ({
    nodeStatuses: {
      ...state.nodeStatuses,
      [nodeId]: status,
    },
  })),
  
  setHitlRequest: (request) => set({ pendingHitl: request }),
  
  reset: () => set({
    currentExecution: null,
    status: null,
    nodeStatuses: {},
    pendingHitl: null,
  }),
}));
```

## WebSocket Hook

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { useExecutionStore } from '@/stores/executionStore';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const { currentExecution, updateNodeStatus, setHitlRequest } = useExecutionStore();
  
  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:3000/ws');
    
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'execution:node:started':
          updateNodeStatus(message.payload.nodeId, {
            status: 'running',
            startedAt: message.payload.startedAt,
          });
          break;
          
        case 'execution:node:completed':
          updateNodeStatus(message.payload.nodeId, {
            status: 'completed',
            output: message.payload.output,
            finishedAt: message.payload.finishedAt,
          });
          break;
          
        case 'execution:node:error':
          updateNodeStatus(message.payload.nodeId, {
            status: 'error',
            error: message.payload.error,
          });
          break;
          
        case 'hitl:required':
          setHitlRequest(message.payload);
          break;
          
        case 'hitl:resolved':
          setHitlRequest(null);
          break;
      }
    };
    
    return () => ws.current?.close();
  }, []);
  
  // Subscribe to execution updates
  useEffect(() => {
    if (currentExecution && ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'subscribe:execution',
        executionId: currentExecution,
      }));
    }
  }, [currentExecution]);
  
  return ws.current;
}
```

## Pages

### Workflow Editor Page

```tsx
// pages/WorkflowEditor.tsx
import { Canvas } from '@/components/canvas/Canvas';
import { NodePalette } from '@/components/canvas/NodePalette';
import { NodeConfigPanel } from '@/components/panels/NodeConfigPanel';
import { ExecutionOverlay } from '@/components/execution/ExecutionOverlay';
import { HitlModal } from '@/components/hitl/HitlModal';
import { Toolbar } from '@/components/Toolbar';

export function WorkflowEditor() {
  const { id } = useParams();
  const { loadWorkflow, saveWorkflow, isDirty } = useWorkflowStore();
  
  useEffect(() => {
    if (id) loadWorkflow(id);
  }, [id]);
  
  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        onSave={saveWorkflow}
        onExecute={handleExecute}
        isDirty={isDirty}
      />
      
      <div className="flex-1 flex">
        <NodePalette />
        
        <div className="flex-1 relative">
          <Canvas />
          <ExecutionOverlay />
        </div>
        
        <NodeConfigPanel />
      </div>
      
      <HitlModal />
    </div>
  );
}
```

## Styling (Tailwind)

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Node status colors
        'node-pending': '#e5e7eb',
        'node-running': '#60a5fa',
        'node-completed': '#4ade80',
        'node-error': '#f87171',
        'node-hitl': '#fbbf24',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```
