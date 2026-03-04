# Expert Agent MVP - Implementation Plan

## Overview

Build an expert agent system in **garage-factory** (code at `/Users/antonsekoldin/Documents/QoderProjects/garage-tools`) where users chat with domain-specific AI agents that select and execute workflow scenarios via OpenClaw tool-calling.

**Flow:** User selects domain -> opens case (chat session) -> describes task -> OpenClaw agent picks scenario tools -> executes workflows via bridge API -> returns results step by step.

---

## Architecture

```
Frontend (React)                    Backend (Express)                 OpenClaw
+-----------------+    HTTP/WS     +-------------------+   HTTP      +------------------+
| ExpertChatPage  | <----------->  | /api/expert/*     | <-------->  | Agent per domain |
| - domain select |                | - domains CRUD    |             | - skills = tools |
| - chat panel    |                | - cases CRUD      |             | - allow list     |
| - HITL cards    |                | - /chat endpoint  |             +--------+---------+
| - case progress |                | - /bridge/execute |                      |
+-----------------+                +--------+----------+                      |
                                           |                                  |
                                     SQLite DB                    skill calls back to
                                  (4 new tables)                  /api/expert/bridge/execute
```

---

## Phase 1: Data Layer

### New tables in `packages/shared/src/schema.ts`

**`domains`** - Office/expertise area
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | auto-generated |
| name | text NOT NULL | "HR Operations" |
| slug | text NOT NULL UNIQUE | "hr-ops", used for OpenClaw agent ID |
| description | text | Shown on domain selection |
| icon | text | Lucide icon name |
| agentId | text | OpenClaw agent ID |
| systemPrompt | text | Domain-specific agent instructions |
| createdAt | integer timestamp | |
| updatedAt | integer timestamp | |

**`scenario_metadata`** - Links workflow to domain with tool metadata
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | auto-generated |
| workflowId | text NOT NULL FK -> workflows.id | cascade delete |
| domainId | text NOT NULL FK -> domains.id | cascade delete |
| toolName | text NOT NULL UNIQUE | snake_case, e.g. `check_employee_leave` |
| shortDescription | text NOT NULL | One sentence for tool selection |
| whenToApply | text NOT NULL | Guidance for agent when to pick this tool |
| inputSchema | text JSON | JSON Schema describing input params |
| expectedOutput | text | What the tool returns |
| riskClass | text enum: read/write/dangerous | Controls confirmation |
| enabled | integer boolean | Disable without deleting |
| createdAt | integer timestamp | |
| updatedAt | integer timestamp | |

**`cases`** - Expert session container
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | auto-generated |
| domainId | text NOT NULL FK -> domains.id | |
| title | text | Auto or user-provided |
| status | text enum: open/completed/abandoned | |
| openclawSessionId | text | OpenClaw session ID |
| summary | text | End-of-case summary by agent |
| createdAt | integer timestamp | |
| updatedAt | integer timestamp | |

**`case_steps`** - Ordered log of case activity
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | auto-generated |
| caseId | text NOT NULL FK -> cases.id | cascade delete |
| stepIndex | integer NOT NULL | Ordering |
| type | text enum | user_message / agent_message / tool_call / tool_result / hitl_request / hitl_response |
| content | text JSON | Type-specific payload |
| executionId | text FK -> executions.id | nullable |
| scenarioId | text FK -> scenario_metadata.id | nullable |
| createdAt | integer timestamp | |

### New types in `packages/shared/src/types.ts`

```typescript
export type RiskClass = 'read' | 'write' | 'dangerous';
export type CaseStatus = 'open' | 'completed' | 'abandoned';
export type CaseStepType = 'user_message' | 'agent_message' | 'tool_call' | 'tool_result' | 'hitl_request' | 'hitl_response';

export interface Domain { id: string; name: string; slug: string; description?: string; icon?: string; agentId?: string; systemPrompt?: string; createdAt?: Date; updatedAt?: Date; }
export interface ScenarioMetadata { id: string; workflowId: string; domainId: string; toolName: string; shortDescription: string; whenToApply: string; inputSchema?: Record<string, unknown>; expectedOutput?: string; riskClass: RiskClass; enabled: boolean; }
export interface Case { id: string; domainId: string; title?: string; status: CaseStatus; openclawSessionId?: string; summary?: string; createdAt?: Date; updatedAt?: Date; }
export interface CaseStep { id: string; caseId: string; stepIndex: number; type: CaseStepType; content: unknown; executionId?: string; scenarioId?: string; createdAt?: Date; }
export interface SyncExecuteResult { executionId: string; status: 'completed' | 'failed' | 'waiting_hitl'; outputs?: unknown; error?: string; hitlRequestId?: string; durationMs: number; }
```

### Files to modify
- `packages/shared/src/schema.ts` - Add 4 tables + relations
- `packages/shared/src/types.ts` - Add interfaces above
- `packages/backend/src/db/index.ts` - Add CREATE TABLE IF NOT EXISTS for 4 tables + indexes

---

## Phase 2: Sync Executor (Bridge Core)

### New file: `packages/backend/src/services/sync-executor.ts`

The current `POST /api/workflows/:id/execute` is fire-and-forget. OpenClaw skills need synchronous results.

**`syncExecute(workflowId, triggerData, timeoutMs = 60000)`**:
1. Call `executionService.executeWorkflow(workflowId, 'manual', triggerData)` -> get `executionId`
2. Subscribe to `ExecutionRunner` events via the broadcast system (listen for `execution:completed`, `execution:failed`, `hitl:required`)
3. Return Promise that resolves when execution finishes
4. On `execution:completed`: query DB for final node outputs -> resolve `SyncExecuteResult`
5. On `execution:failed`: resolve with `{ status: 'failed', error }`
6. On `hitl:required`: resolve with `{ status: 'waiting_hitl', hitlRequestId }`
7. On timeout: abort execution, resolve with `{ status: 'failed', error: 'timeout' }`

**Concurrent safety**: Each call creates its own execution - fully independent per the existing architecture (verified: `ExecutionRunner` has its own `StateManager` instance, no shared state).

---

## Phase 3: Expert API Routes

### New file: `packages/backend/src/api/expert.ts`

Mount at `/api/expert` in `packages/backend/src/index.ts`.

**Domain endpoints:**
- `GET /api/expert/domains` - List all domains with scenario count
- `GET /api/expert/domains/:id` - Domain + its scenarios
- `POST /api/expert/domains` - Create domain, provision OpenClaw agent
- `PUT /api/expert/domains/:id` - Update domain metadata
- `DELETE /api/expert/domains/:id` - Delete (cascades)

**Scenario endpoints:**
- `GET /api/expert/domains/:domainId/scenarios` - List scenarios
- `POST /api/expert/domains/:domainId/scenarios` - Register workflow as scenario tool; generates OpenClaw skill files
- `PUT /api/expert/domains/:domainId/scenarios/:id` - Update; regenerate skill if toolName/schema changed
- `DELETE /api/expert/domains/:domainId/scenarios/:id` - Remove + clean skill files

**Case endpoints:**
- `GET /api/expert/cases?domainId=` - List cases
- `GET /api/expert/cases/:id` - Case with steps
- `POST /api/expert/cases` - Create case + init OpenClaw session
- `PATCH /api/expert/cases/:id` - Update status/summary

**Chat endpoint (main interaction):**
- `POST /api/expert/cases/:id/chat` - Send user message
  1. Append `user_message` case_step
  2. Send message to OpenClaw agent via CLI spawn (using case's openclawSessionId)
  3. OpenClaw agent processes, may call tools (callback to bridge)
  4. Receive final text response
  5. Append `agent_message` case_step
  6. Return `{ response, steps }`

**Bridge endpoint (called BY OpenClaw skills, not by UI):**
- `POST /api/expert/bridge/execute` - `{ toolName, inputs, caseId }`
  1. Look up scenario_metadata by toolName -> get workflowId
  2. Append `tool_call` case_step
  3. Call `syncExecutor.syncExecute(workflowId, inputs)`
  4. Append `tool_result` case_step
  5. Return `SyncExecuteResult`

---

## Phase 4: OpenClaw Integration

### New file: `packages/backend/src/services/agent-provisioner.ts`

On domain creation:
1. Generate agent ID: `expert-{slug}-{shortId}`
2. Create workspace: `~/.openclaw/workspace-{agentId}/`
3. Write `IDENTITY.md` - domain name, role, instructions to use only provided tools
4. Write `openclaw.json` - agent config with tool allow list (only this domain's scenario toolNames)
5. Return agentId

### New file: `packages/backend/src/services/skill-generator.ts`

For each scenario, generates OpenClaw skill at `~/.openclaw/workspace-{agentId}/skills/{toolName}/`:

**`manifest.json`:**
```json
{
  "name": "check_employee_leave",
  "description": "Checks employee leave balance. Use when: user asks about remaining leave days",
  "parameters": { "type": "object", "properties": { "employeeId": { "type": "string" } }, "required": ["employeeId"] }
}
```

**`index.mjs`:**
```js
export default async function handler(args, ctx) {
  const response = await fetch('http://localhost:3000/api/expert/bridge/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName: 'check_employee_leave',
      inputs: args,
      caseId: ctx.env.CASE_ID || 'unknown'
    })
  });
  return response.json();
}
```

### New file: `packages/backend/src/services/openclaw-client.ts`

Manages communication with OpenClaw:
- `sendMessage(agentId, sessionId, message, env)` - spawns `openclaw agent --agent <id> --session-id <sid> -m <msg>` (CLI pattern from aixoffice)
- `createSession(agentId)` - spawns with new session
- Parses stdout for agent response
- Injects `CASE_ID` via environment so skills can pass it back to bridge

---

## Phase 5: Frontend UI

### New pages and components

**`packages/frontend/src/pages/expert/ExpertHome.tsx`**
- Grid of domain cards (icon, name, description, scenario count)
- Click card -> POST /api/expert/cases (create case) -> navigate to chat

**`packages/frontend/src/pages/expert/ExpertChatPage.tsx`**
- Layout: sidebar (cases list) + main panel (chat)
- Uses existing WebSocket hook for real-time updates
- Sends messages via POST /api/expert/cases/:id/chat

**`packages/frontend/src/pages/expert/ExpertDomainSetup.tsx`**
- Admin page: manage domain's scenarios
- Workflow picker (dropdown from existing workflows)
- Tool metadata form (name, description, inputSchema, risk class)

**`packages/frontend/src/components/expert/ExpertChatPanel.tsx`**
- Message bubbles (user right, agent left) - pattern from aixoffice ChatPanel
- Tool call steps shown inline with status indicators
- Typing indicator while agent processes
- Input area with send button

**`packages/frontend/src/components/expert/CaseProgressWidget.tsx`**
- Renders case_steps as ordered list with status icons
- Pattern from aixoffice PipelineWidget (step indicators with amber/green/red colors)

**`packages/frontend/src/components/expert/HITLCard.tsx`**
- Adapted from aixoffice AuthRequestCard
- Renders inline in chat for approval/input/selection
- On submit -> POST /api/hitl/:id/respond

**`packages/frontend/src/components/expert/CasesSidebar.tsx`**
- List of cases for current domain
- Status badges (open/completed)
- "New Case" button

**`packages/frontend/src/components/expert/DomainCard.tsx`**
- Card component for domain selection grid

### Route changes in `packages/frontend/src/App.tsx`
```
/expert                    -> ExpertHome
/expert/domains/:id/setup  -> ExpertDomainSetup  
/expert/cases/:id          -> ExpertChatPage
```

### API client additions in `packages/frontend/src/api/client.ts`
Add `expertApi` object with methods for domains, scenarios, cases, chat.

### Styling
- Reuse existing Tailwind + Radix patterns
- Dark theme via existing CSS variables
- No new UI library dependencies

---

## Implementation Order

1. **Data layer** (schema.ts, types.ts, db/index.ts) - foundation
2. **Sync executor** (sync-executor.ts) - core bridge mechanism, testable in isolation
3. **Expert API** (expert.ts) - domain/scenario CRUD + bridge endpoint
4. **OpenClaw wiring** (agent-provisioner.ts, skill-generator.ts, openclaw-client.ts) - agent+skill creation
5. **Frontend** - ExpertHome -> ExpertChatPage -> CaseProgressWidget -> HITLCard -> DomainSetup
6. **E2E testing** - 2 domains, 5 scenarios each, run 3-5 typical tasks

---

## Files Summary

### New files (10)
- `packages/backend/src/api/expert.ts`
- `packages/backend/src/services/sync-executor.ts`
- `packages/backend/src/services/skill-generator.ts`
- `packages/backend/src/services/agent-provisioner.ts`
- `packages/backend/src/services/openclaw-client.ts`
- `packages/frontend/src/pages/expert/ExpertHome.tsx`
- `packages/frontend/src/pages/expert/ExpertChatPage.tsx`
- `packages/frontend/src/pages/expert/ExpertDomainSetup.tsx`
- `packages/frontend/src/components/expert/ExpertChatPanel.tsx`
- `packages/frontend/src/components/expert/CaseProgressWidget.tsx`
- `packages/frontend/src/components/expert/HITLCard.tsx`
- `packages/frontend/src/components/expert/CasesSidebar.tsx`
- `packages/frontend/src/components/expert/DomainCard.tsx`

### Modified files (5)
- `packages/shared/src/schema.ts` - 4 new tables + relations
- `packages/shared/src/types.ts` - new interfaces
- `packages/backend/src/db/index.ts` - CREATE TABLE for 4 tables
- `packages/backend/src/index.ts` - mount expertRouter
- `packages/frontend/src/App.tsx` - add /expert/* routes
- `packages/frontend/src/api/client.ts` - add expertApi

---

## Verification

1. **Data layer**: Start backend, verify tables created with `sqlite3 database.sqlite ".tables"`
2. **Sync executor**: Create a simple test workflow (manual-trigger -> set), call syncExecute via curl, verify synchronous result
3. **Bridge**: curl POST /api/expert/bridge/execute with a toolName -> verify workflow runs and result returns
4. **OpenClaw**: Create domain, verify agent workspace created with skills, send message via openclaw CLI, verify tool callback hits bridge
5. **Frontend**: Open /expert, select domain, create case, send message, verify chat flow
6. **E2E**: Load 2 domains with 5 scenarios each, run 3-5 typical expert tasks end-to-end, verify agent selects correct tools and results display properly
