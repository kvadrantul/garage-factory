# Architecture Specification

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           BROWSER                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      React Frontend                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Canvas    │  │   Panels    │  │   Execution View    │   │  │
│  │  │  (React     │  │  (Config,   │  │   (Real-time        │   │  │
│  │  │   Flow)     │  │   HITL)     │  │    status)          │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│                    HTTP REST + WebSocket                             │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
┌──────────────────────────────┼───────────────────────────────────────┐
│                           SERVER                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Express/Fastify API                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │  REST API   │  │  WebSocket  │  │   Webhook Server    │   │  │
│  │  │  /api/*     │  │  /ws        │  │   /webhook/:id      │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Workflow Executor                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │  │
│  │  │   Runner    │  │ Node Registry│ │   Event Emitter     │   │  │
│  │  │  (State     │  │  (Node      │  │   (Status updates)  │   │  │
│  │  │   Machine)  │  │   impls)    │  │                     │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      Data Layer                                │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    SQLite                                │  │  │
│  │  │  workflows | executions | execution_data | credentials   │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                              │                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                   External Services                            │  │
│  │  ┌─────────────┐  ┌─────────────┐                             │  │
│  │  │  OpenClaw   │  │  HTTP APIs  │                             │  │
│  │  │  (CLI)      │  │  (external) │                             │  │
│  │  └─────────────┘  └─────────────┘                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend (React)

#### 1.1 Canvas Editor
- **Library**: React Flow v11+
- **Features**:
  - Custom node types (trigger, action, logic, agent, hitl)
  - Custom edge types with labels
  - Mini-map for navigation
  - Controls (zoom, fit view)
  - Node selection and multi-select
  - Copy/paste nodes
  - Undo/redo (optional)

#### 1.2 Node Palette
- Sidebar with available nodes grouped by category
- Drag from palette to canvas
- Search/filter nodes

#### 1.3 Configuration Panel
- Right sidebar for selected node configuration
- Dynamic form based on node type
- JSON editor for advanced config

#### 1.4 Execution View
- Overlay on canvas showing execution status
- Node status indicators (pending, running, success, error)
- Data flow visualization
- Execution timeline

#### 1.5 HITL Widgets
- Modal dialogs for approval requests
- Custom input forms
- Timeout countdown
- Decision buttons (Approve/Reject)

### 2. Backend (Express)

#### 2.1 REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workflows` | GET | List all workflows |
| `/api/workflows` | POST | Create workflow |
| `/api/workflows/:id` | GET | Get workflow by ID |
| `/api/workflows/:id` | PUT | Update workflow |
| `/api/workflows/:id` | DELETE | Delete workflow |
| `/api/workflows/:id/execute` | POST | Execute workflow |
| `/api/executions` | GET | List executions |
| `/api/executions/:id` | GET | Get execution details |
| `/api/executions/:id/stop` | POST | Stop execution |
| `/api/hitl/:id/respond` | POST | Respond to HITL |
| `/api/credentials` | GET/POST | Manage credentials |

#### 2.2 WebSocket Events

**Server → Client:**
```typescript
interface WSMessage {
  type: 
    | 'execution:started'
    | 'execution:node:started'
    | 'execution:node:completed'
    | 'execution:node:error'
    | 'execution:completed'
    | 'execution:failed'
    | 'hitl:required'
    | 'hitl:resolved';
  payload: any;
}
```

**Client → Server:**
```typescript
interface WSClientMessage {
  type: 'subscribe:execution' | 'unsubscribe:execution';
  executionId: string;
}
```

#### 2.3 Webhook Server
- Dynamic webhook endpoints per workflow
- Unique webhook ID per trigger node
- Request parsing (JSON, form-data)
- Response handling

### 3. Workflow Executor

#### 3.1 Execution Model

```typescript
interface Execution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'waiting_hitl' | 'completed' | 'failed' | 'stopped';
  startedAt: Date;
  finishedAt?: Date;
  error?: string;
  data: ExecutionData;
}

interface ExecutionData {
  nodes: Record<NodeId, NodeExecutionData>;
  connections: ConnectionData[];
}

interface NodeExecutionData {
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startedAt?: Date;
  finishedAt?: Date;
  input?: any;
  output?: any;
  error?: string;
}
```

#### 3.2 Execution Flow

```
1. Receive trigger (webhook, schedule, manual)
2. Create Execution record
3. Resolve starting nodes (trigger nodes)
4. Execute nodes in topological order:
   a. Get node inputs from connected nodes' outputs
   b. Execute node implementation
   c. Store node output
   d. If HITL node: pause, emit event, wait for response
   e. If Agent node: call OpenClaw, wait for response
   f. Emit status update via WebSocket
   g. Continue to next nodes
5. Mark execution as completed/failed
```

#### 3.3 Node Runner Interface

```typescript
interface NodeRunner {
  type: string;
  execute(context: NodeContext): Promise<NodeOutput>;
}

interface NodeContext {
  node: WorkflowNode;
  inputs: Record<string, any>;  // from connected nodes
  credentials?: Record<string, string>;
  execution: Execution;
  emit: (event: string, data: any) => void;
}

interface NodeOutput {
  data: any;
  // For HITL nodes
  waitForHitl?: {
    type: 'approval' | 'input';
    message: string;
    options?: any;
  };
}
```

### 4. Data Layer (SQLite)

#### 4.1 ORM
- **Drizzle ORM** - lightweight, type-safe
- Migrations via drizzle-kit
- Connection pooling (better-sqlite3)

#### 4.2 Tables
- `workflows` - workflow definitions
- `executions` - execution records
- `execution_data` - node execution data (JSON)
- `credentials` - stored credentials (encrypted)
- `webhook_keys` - webhook URL mappings

### 5. External Integrations

#### 5.1 OpenClaw Integration

```typescript
async function callOpenClawAgent(
  agentId: string, 
  message: string,
  options?: { timeout?: number; sessionId?: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('openclaw', [
      'agent',
      '--agent', agentId,
      '-m', message,
      '--timeout', String(options?.timeout ?? 180)
    ]);
    
    // ... handle stdout, stderr, exit
  });
}
```

#### 5.2 HTTP Client
- Use `undici` or `node-fetch` for HTTP requests
- Support for all HTTP methods
- Headers, body, query params
- Response parsing

## Data Flow

### Workflow Creation
```
User draws on Canvas
    → Frontend sends workflow JSON
    → Backend validates
    → Backend saves to SQLite
    → Backend returns workflow ID
```

### Workflow Execution
```
Trigger fires (webhook/schedule/manual)
    → Backend creates Execution record
    → Executor starts processing nodes
    → For each node:
        → Emit 'node:started' via WebSocket
        → Execute node
        → Store output
        → Emit 'node:completed' via WebSocket
    → On completion:
        → Update Execution status
        → Emit 'execution:completed'
```

### HITL Flow
```
Executor reaches HITL node
    → Emit 'hitl:required' via WebSocket
    → Frontend shows HITL widget
    → User makes decision
    → Frontend calls /api/hitl/:id/respond
    → Backend resumes execution
    → Emit 'hitl:resolved'
```

## Security Considerations (MVP)

1. **Credentials Storage**: Simple encryption with app-level key
2. **Webhook Security**: Random UUID paths
3. **Code Execution**: Sandboxed VM (vm2 or isolated-vm)
4. **No Auth**: Single-user, localhost only

## Performance Targets

- Canvas: 100+ nodes without lag
- Execution: <100ms overhead per node
- WebSocket: <50ms latency for updates
- SQLite: <10ms for typical queries

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | React | Ecosystem, React Flow compatibility |
| State management | Zustand | Simple, lightweight |
| Canvas library | React Flow | Best-in-class, customizable |
| Backend framework | Fastify | Fast, TypeScript-friendly |
| Database | SQLite | No setup, single file |
| ORM | Drizzle | Type-safe, lightweight |
| WebSocket | ws | Standard, reliable |
| Build | Vite (FE), tsup (BE) | Fast, modern |
| Monorepo | pnpm workspaces | Simple, fast |
