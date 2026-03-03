# Garage Tools -- Status: What's Done

Visual workflow automation platform with AI agent integration and Human-in-the-Loop (HITL).

## Architecture

```
orchestrator/
├── packages/
│   ├── shared/          # TypeScript types + Drizzle ORM schema
│   ├── backend/         # Express API server + execution engine
│   └── frontend/        # React + React Flow visual editor
├── specs/               # Original design specifications (7 files)
├── drizzle/             # Generated SQL migrations
└── database.sqlite      # SQLite database (created on first run)
```

Monorepo managed by **pnpm workspaces**. All packages build successfully.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Flow, Zustand, TanStack Query, TailwindCSS, Vite |
| Backend | Express, TypeScript, WebSocket (ws) |
| Database | SQLite via better-sqlite3 + Drizzle ORM |
| Build | tsup (backend/shared), Vite (frontend), pnpm workspaces |

## Commands

```bash
pnpm install           # Install all dependencies
pnpm dev               # Start backend (:3000) + frontend (:5173) concurrently
pnpm dev:backend       # Backend only
pnpm dev:frontend      # Frontend only
pnpm build             # Build all packages
pnpm db:generate       # Generate Drizzle migrations
```

---

## Completed Components

### 1. Shared Package (`packages/shared/`)

| File | Description |
|------|------------|
| `src/types.ts` | ~280 lines. All TypeScript interfaces: WorkflowDefinition, WorkflowNode, NodeType (11 types), ExecutionStatus, NodeContext, NodeResult, HITLRequest/Response, API types, WebSocket message types, NodeDefinition for UI |
| `src/schema.ts` | Drizzle ORM schema with 6 tables + relations |
| `src/index.ts` | Re-exports types |

### 2. Database (`packages/backend/src/db/`)

6 SQLite tables with indexes:

| Table | Purpose |
|-------|---------|
| `workflows` | Workflow definitions (id, name, description, definition JSON, settings, active flag) |
| `executions` | Execution records (status, triggerType, triggerData, error, timestamps) |
| `execution_nodes` | Per-node execution data (status, inputData, outputData, error) |
| `credentials` | Stored credentials (name, type, encrypted data) |
| `webhooks` | Registered webhook paths (workflowId, nodeId, path, method) |
| `hitl_requests` | HITL pause records (type, requestData, status, responseData, expiresAt) |

Database initializes automatically on server start via `initializeDatabase()`.

### 3. API Routes (`packages/backend/src/api/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/workflows` | GET | List workflows (pagination) |
| `/api/workflows/:id` | GET | Get workflow by ID |
| `/api/workflows` | POST | Create workflow |
| `/api/workflows/:id` | PUT | Update workflow |
| `/api/workflows/:id` | DELETE | Delete workflow |
| `/api/workflows/:id/execute` | POST | Execute workflow (wired to ExecutionService) |
| `/api/workflows/:id/activate` | POST | Activate workflow |
| `/api/workflows/:id/deactivate` | POST | Deactivate workflow |
| `/api/executions` | GET | List executions (with workflow name join) |
| `/api/executions/:id` | GET | Get execution + all node results |
| `/api/executions/:id/stop` | POST | Stop running execution (via ExecutionService) |
| `/api/executions/:id` | DELETE | Delete execution |
| `/api/hitl` | GET | List HITL requests (filter by status/executionId) |
| `/api/hitl/:id/respond` | POST | Respond to HITL (approve/reject/submit) |
| `/api/credentials` | GET | List credentials (without sensitive data) |
| `/api/credentials/:id` | GET | Get credential by ID (without sensitive data) |
| `/api/credentials` | POST | Create credential (data stored as JSON buffer) |
| `/api/credentials/:id` | PUT | Update credential |
| `/api/credentials/:id` | DELETE | Delete credential |
| `/webhooks/:path` | ALL | Webhook handler - triggers workflow execution |

### 3b. Webhook Handler (`packages/backend/src/webhooks/`)

| File | Description |
|------|------------|
| `webhook-handler.ts` | Routes incoming HTTP requests to trigger workflow executions |

- `ALL /webhooks/:path` - looks up webhook by path, validates method, executes workflow
- `registerWebhooksForWorkflow()` - called on workflow activate
- `unregisterWebhooksForWorkflow()` - called on workflow deactivate

### 4. Execution Engine (`packages/backend/src/executor/`)

| File | Description |
|------|------------|
| `graph-resolver.ts` | Builds adjacency lists from workflow definition. Provides: `getStartNodes()`, `getExecutionOrder()` (topological sort), `getNodeInputs()`, `getDownstreamNodes()`, `getEdge()` |
| `state-manager.ts` | In-memory state during execution: node results, output indices (for conditional routing), executed-set tracking |
| `execution-runner.ts` | Main orchestrator. Creates execution record, walks graph from triggers, executes nodes via registry, handles conditional branching (outputIndex), HITL pauses (polls DB for response), broadcasts events via EventEmitter. Supports abort via AbortController |
| `errors.ts` | Error classes: ExecutionError, NodeExecutionError, HITLTimeoutError, AbortedError |

**Data flow**: trigger data -> each node receives output of predecessors -> conditional nodes set `outputIndex` -> downstream routing checks `sourceHandle` match -> merge nodes collect multiple inputs.

**HITL flow**: node returns `waitForHitl` -> runner inserts `hitl_requests` row, sets execution to `waiting_hitl` -> polls every 1s for response -> on approve, resumes downstream execution.

### 5. Node Runners (`packages/backend/src/nodes/`)

All 11 node types implemented with `NodeRunner` interface (`execute(context) -> NodeResult`):

| Node | File | Notes |
|------|------|-------|
| `manual-trigger` | `triggers/manual.ts` | Passes triggerData + timestamp |
| `webhook-trigger` | `triggers/webhook.ts` | Extracts headers/query/body/method/path |
| `schedule-trigger` | `triggers/schedule.ts` | Passes scheduled timestamp |
| `http-request` | `actions/http-request.ts` | fetch() with method/headers/body/timeout, credential injection (bearer, api_key, basic_auth) |
| `code` | `actions/code.ts` | Sandboxed via `node:vm` with $input/$inputs/$node/$execution/$result. 10s timeout. Console.log capture. Proper async/await support |
| `set` | `actions/set.ts` | Modes: set, append, remove. Option `keepOnlySet` |
| `if` | `logic/if.ts` | Conditions: equals/notEquals/contains/gt/lt/gte/lte/isEmpty/isNotEmpty. Combine: AND/OR. Returns `outputIndex` 0 (true) or 1 (false) |
| `switch` | `logic/switch.ts` | Multi-case matching on nested value path, optional fallback output |
| `merge` | `logic/merge.ts` | Modes: append (array concat) or combine (object merge) |
| `agent` | `ai/agent.ts` | OpenAI API + OpenClaw CLI modes. Streaming support. Config: provider/model/systemPrompt/temperature/timeout |
| `hitl` | `ai/hitl.ts` | Returns `waitForHitl` with type/message/details/fields/options/timeout |

Registry: `nodes/registry.ts` maps type string -> runner instance.

### 6. ExecutionService (`packages/backend/src/services/`)

Singleton pattern via `initExecutionService(broadcast)` / `getExecutionService()`.

- Manages `Map<executionId, ExecutionRunner>` for active executions
- Forwards all runner events to WebSocket broadcast
- `executeWorkflow()` -- creates runner, subscribes events, returns executionId
- `stopExecution()` -- aborts runner + updates DB

### 6b. Scheduler (`packages/backend/src/services/scheduler.ts`)

Singleton pattern via `initScheduler()` / `getScheduler()`.

- Manages `Map<jobKey, CronJob>` for scheduled workflows
- `initialize()` -- loads all active workflows, creates CronJobs for schedule-trigger nodes
- `registerWorkflowSchedules()` -- called on workflow activate
- `unregisterWorkflow()` -- called on workflow deactivate
- Triggers `executionService.executeWorkflow(workflowId, 'schedule', triggerData)`

### 7. WebSocket Server (`packages/backend/src/index.ts`)

- Path: `ws://localhost:3000/ws`
- Client messages: `subscribe:execution`, `unsubscribe:execution`
- Server broadcasts: `execution:started/completed/failed`, `execution:node:started/completed/error`, `hitl:required/resolved`
- Subscriptions tracked per executionId. Also broadcasts to all connected clients.

### 8. Frontend (`packages/frontend/`)

| File | Description |
|------|------------|
| `App.tsx` | Routes: `/workflows`, `/workflows/new`, `/workflows/:id`, `/executions`, `/executions/:id`, `/hitl` |
| `api/client.ts` | API client for workflows, executions, HITL, credentials endpoints |
| `stores/workflowStore.ts` | Zustand store: nodes, edges, selectedNode, isDirty, CRUD operations |
| `pages/WorkflowList.tsx` | Dashboard with workflow cards, create/delete/execute actions, nav header |
| `pages/WorkflowEditor.tsx` | React Flow canvas + HITL popup panel when waiting for approval |
| `pages/ExecutionList.tsx` | Table of executions with status, duration, stop/delete actions |
| `pages/ExecutionDetail.tsx` | Execution summary + per-node results with JSON viewers |
| `pages/HITLList.tsx` | Standalone page listing all HITL requests with inline response forms |
| `components/canvas/NodePalette.tsx` | Sidebar with 11 draggable node types grouped by category |
| `components/panels/NodeConfigPanel.tsx` | Dynamic config forms per node type |
| `components/panels/HITLPanel.tsx` | Popup panel for approval/input/selection responses |
| `components/nodes/WorkflowNode.tsx` | Custom node: color-coded, status rings (waiting_hitl=amber pulse) |
| `hooks/useWebSocket.ts` | WebSocket hook with subscribe/unsubscribe, handles hitl:required events |

### 9. E2E Verification

Tested via API: `manual-trigger -> set -> if` workflow.
- All 3 nodes executed successfully
- Data correctly flows through pipeline (set merges values, if evaluates condition)
- Execution record + per-node records stored in DB with input/output data

---

## Specs Reference

Original specifications in `specs/`:

| File | Content |
|------|---------|
| `SPEC.md` | Product vision, features, milestones |
| `ARCHITECTURE.md` | System architecture, components, data flow |
| `DATABASE.md` | Schema design, Drizzle setup |
| `API.md` | REST API + WebSocket protocol |
| `NODES.md` | All 11 node types with interfaces and implementations |
| `EXECUTOR.md` | Execution engine design, HITL handling, scheduler, webhook handler |
| `FRONTEND.md` | React components, stores, hooks, pages |

---

## Recent Enhancements

### Expression Resolver (`packages/backend/src/executor/expression-resolver.ts`)

Extended n8n-compatible expression syntax:

| Expression | Description |
|------------|-------------|
| `{{ $input.path }}` | Access upstream node output |
| `{{ $json.path }}` | Alias for $input (n8n compatibility) |
| `{{ $node["nodeName"].json.path }}` | Reference specific node output |
| `{{ $vars.varName }}` | Workflow-level variables |
| `{{ $env.VAR_NAME }}` | Environment variables |

### Credentials Integration

- HTTP nodes can select credentials from dropdown
- Backend automatically loads and applies credentials:
  - `api_key` - adds custom header
  - `bearer_token` - adds Authorization Bearer header
  - `basic_auth` - adds Authorization Basic header
- Credentials page (`/credentials`) with CRUD operations

### NDV Panel (Node Detail View)

n8n-style node inspector panel:
- **Settings tab**: Node configuration with type-specific forms
- **Output tab**: Execution results with status, duration, input/output data
- Collapsible JSON data sections

### Execution History Sidebar

- Toggle via History button in editor toolbar
- Shows last 20 executions for current workflow
- Status icons, trigger type, duration
- Auto-refresh during active execution

### Enhanced Execution Visualization

- Blue ring + shadow on running nodes
- Green ring on completed nodes
- Animated edges during data flow (blue incoming, green outgoing)
- Edge reset on new execution start
