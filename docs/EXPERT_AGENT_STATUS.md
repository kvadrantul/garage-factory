# Expert Agent System - Implementation Status

## Overview

The Expert Agent system allows users to chat with domain-specific AI agents that can execute workflow scenarios. This document tracks what's implemented and what remains to be done.

**Spec file:** `docs/EXPERT_AGENT_SPEC.md`

---

## IMPLEMENTED (Working)

### 1. Database Schema
**File:** `packages/shared/src/schema.ts`

4 tables:
- `domains` - expertise areas (Legal Office, Bank Statement Analyst, etc.)
- `scenarios` - workflow-to-tool mappings with inputsSchema, riskClass, estimatedDuration
- `cases` - chat sessions within a domain
- `caseSteps` - conversation history (user_message, assistant_message, tool_call, tool_result, hitl_request, hitl_response, error)

### 2. Domain CRUD API
**File:** `packages/backend/src/api/expert.ts`

```
GET    /api/expert/domains          - List all domains
POST   /api/expert/domains          - Create domain (auto-provisions OpenClaw agent)
GET    /api/expert/domains/:id      - Get domain
PUT    /api/expert/domains/:id      - Update domain (updates agent IDENTITY.md)
DELETE /api/expert/domains/:id      - Delete (cascades + removes OpenClaw agent)
```

Domain fields: name, slug, icon, description, agentId, systemPrompt.

On domain creation, if no agentId is provided, `agent-provisioner.ts` auto-creates an OpenClaw agent with workspace and IDENTITY.md.

### 3. Scenario CRUD API
**File:** `packages/backend/src/api/expert.ts`

```
GET    /api/expert/scenarios           - List scenarios (filter by domain_id)
POST   /api/expert/scenarios           - Create scenario (generates SKILL.md)
GET    /api/expert/scenarios/:id       - Get scenario
PUT    /api/expert/scenarios/:id       - Update (regenerates skill)
DELETE /api/expert/scenarios/:id       - Delete (removes skill file)
```

Scenario fields: workflowId, domainId, toolName, name, shortDescription, whenToApply, inputsSchema, outputsSchema, riskClass, estimatedDuration, enabled.

On create/update/delete, `skill-generator.ts` manages SKILL.md files in `~/.openclaw/skills/{toolName}/`.

### 4. Case CRUD API
**File:** `packages/backend/src/api/expert.ts`

```
GET    /api/expert/cases            - List cases (filter by domain_id, status)
POST   /api/expert/cases            - Create case
GET    /api/expert/cases/:id        - Get case with domain info
PUT    /api/expert/cases/:id        - Update status/summary
DELETE /api/expert/cases/:id        - Delete case
```

### 5. Chat API with Tool-Calling Loop
**File:** `packages/backend/src/api/chat.ts`

```
POST   /api/chat/send               - Send message to agent
GET    /api/chat/history/:case_id   - Get chat history
```

**How it works:**
1. Receives `{ case_id, message }`
2. Looks up domain's `agentId` and enabled scenarios
3. Builds tool context (available tools with descriptions and parameters)
4. Sends enriched message to OpenClaw agent via CLI spawn
5. Parses agent response for tool calls (`{"tool_call": {"tool_name": "...", "inputs": {...}}}`)
6. If tool call detected: executes workflow via sync-executor, feeds result back to agent
7. Loop continues up to 3 iterations (tool call -> execute -> result -> agent response)
8. Saves all steps: user_message, tool_call, tool_result, assistant_message, error
9. Manages OpenClaw session ID for conversation continuity

### 6. Bridge API
**File:** `packages/backend/src/api/bridge.ts`

```
POST   /api/bridge/catalog          - List available tools for a domain
POST   /api/bridge/run              - Execute a scenario tool synchronously
POST   /api/bridge/status           - Get execution status with HITL details
```

Features:
- Bearer token authentication (bridge-auth.ts)
- Idempotency via deduplication cache (hash of case_id + domain_id + tool_name + inputs)
- Returns outputs from completed workflow nodes
- HITL request details when workflow pauses

### 7. Sync Executor
**File:** `packages/backend/src/services/sync-executor.ts`

Wraps fire-and-forget workflow execution into blocking Promise-based calls.

Uses `completionPromise` directly from ExecutionService to avoid race conditions with event-based notification (SQLite sync operations caused execution to complete before event listeners were registered).

### 8. Agent Provisioner
**File:** `packages/backend/src/services/agent-provisioner.ts`

On domain creation:
1. Creates OpenClaw agent via CLI: `openclaw agents add --workspace <path> --non-interactive --json`
2. Writes IDENTITY.md with domain name, description, role, and system prompt
3. On domain update: rewrites IDENTITY.md
4. On domain delete: removes agent via `openclaw agents rm`

### 9. Skill Generator
**File:** `packages/backend/src/services/skill-generator.ts`

For each scenario, generates SKILL.md files in `~/.openclaw/skills/{toolName}/`:
- YAML frontmatter: name, description, metadata (emoji)
- Markdown body: commands, parameters, examples (curl calls to bridge API)
- Bearer token authentication in curl examples

### 10. Frontend Pages
**Files:**
- `packages/frontend/src/pages/DomainList.tsx` - domain grid with create/edit modals
- `packages/frontend/src/pages/ScenarioList.tsx` - scenario list with create/edit, risk class, enable/disable
- `packages/frontend/src/pages/CaseList.tsx` - cases for a domain with status filtering
- `packages/frontend/src/pages/CaseChat.tsx` - full chat interface

**Routes in App.tsx:**
```
/domains                    - DomainList
/scenarios                  - ScenarioList (with domain_id query param)
/cases                      - CaseList (with domain_id query param)
/cases/:id/chat             - CaseChat
```

### 11. Chat UI Features
**File:** `packages/frontend/src/pages/CaseChat.tsx`

- User message bubbles (right-aligned)
- Agent message bubbles (left-aligned)
- Tool call cards (blue) showing tool name and inputs
- Tool result cards (green/red) showing execution status and JSON output
- HITL request cards (yellow) with interactive inline response:
  - **Approval type:** Approve/Reject buttons with optional rejection reason
  - **Input type:** Dynamic form fields (text, number, boolean, select, textarea)
  - **Selection type:** Radio buttons with option descriptions
  - Already-responded requests render as read-only status cards
  - Backend creates `hitl_response` case step on submission
- Error cards (red)
- "Agent is thinking..." loading indicator
- Auto-scroll to latest message
- Enter-to-send, disabled input during processing

### 12. Navigation
**File:** `packages/frontend/src/components/AppHeader.tsx`

"Expert Agent" link in header navigation -> `/domains`

### 13. Frontend API Client
**File:** `packages/frontend/src/api/client.ts`

- `domainsApi` - CRUD for domains
- `scenariosApi` - CRUD for scenarios
- `casesApi` - CRUD for cases
- `chatApi` - send message, get history

### 14. OpenClaw Session Management
Session ID is:
- Created on first agent interaction
- Stored in case record (`openclawSessionId`)
- Passed on subsequent messages for conversation continuity

### 15. Cases Sidebar
**File:** `packages/frontend/src/components/expert/CasesSidebar.tsx`

- Left sidebar (w-64) in CaseChat page listing all cases for current domain
- Status icons (Clock/CheckCircle/XCircle) with color coding
- Active case highlighted with `bg-accent`
- "New Case" button for creating cases in same domain
- Click to switch between cases without leaving chat
- Collapsible via toggle button to maximize chat area
- Includes case count footer

### 16. Case Progress Widget
**File:** `packages/frontend/src/components/expert/CaseProgressWidget.tsx`

- Compact vertical timeline of case steps with status dots/icons
- Color-coded: blue (user), green (completed/agent), yellow (pending/HITL), red (error)
- Short labels with content preview (truncated to 30 chars)
- Integrated as collapsible "Progress" section at bottom of CasesSidebar
- Dynamic overrides for tool_result (success/fail/waiting) and hitl_response (approved/rejected)

### 17. Chat History HITL Enrichment
**File:** `packages/backend/src/api/chat.ts`

- GET /chat/history/:case_id enriches hitl_request steps with `hitl_details` from hitlRequests table
- Includes: hitl_id, type, status, message, details, fields, options
- Allows frontend to render interactive HITL forms without additional API calls

### 18. HITL Response Step Creation
**File:** `packages/backend/src/api/hitl.ts`

- POST /hitl/:id/respond now creates a `hitl_response` case step after updating hitlRequests
- Finds parent case via executionId -> caseSteps join
- Step content includes: status, action, data, reason, hitlRequestId

---

## NOT YET IMPLEMENTED

All Phase 5 features are now implemented. The Expert Agent MVP is complete.

---

## Verified E2E Flow

Tested with Bank Statement Analyst domain:
1. Created domain "Bank Statement Analyst" with auto-provisioned OpenClaw agent
2. Created scenario "Sum Operations by BIK" linked to excel-bik-sum workflow
3. Created case, sent message: "Посчитай сумму операций по БИК 044525225"
4. Agent detected tool need, responded with tool_call JSON
5. Framework executed workflow via sync-executor
6. Workflow returned: 64 operations, sumTotal: 212,488,881.65
7. Result fed back to agent, agent formatted human-readable response
8. All steps visible in chat UI (user message, tool call card, tool result card, agent response)

---

## File Structure

### Backend Services (Created)
```
packages/backend/src/services/sync-executor.ts      - Synchronous workflow execution
packages/backend/src/services/skill-generator.ts     - Generate OpenClaw SKILL.md files
packages/backend/src/services/agent-provisioner.ts   - Create/update/delete OpenClaw agents
```

### Backend APIs (Created/Modified)
```
packages/backend/src/api/expert.ts     - Domain/Scenario/Case CRUD with provisioning hooks
packages/backend/src/api/chat.ts       - Chat with tool-calling loop
packages/backend/src/api/bridge.ts     - Bridge API for tool execution
```

### Shared (Modified)
```
packages/shared/src/schema.ts          - 4 tables (domains, scenarios, cases, caseSteps)
packages/shared/src/types.ts           - Interfaces + extended CaseStepType enum
```

### Frontend (Created)
```
packages/frontend/src/pages/DomainList.tsx
packages/frontend/src/pages/ScenarioList.tsx
packages/frontend/src/pages/CaseList.tsx
packages/frontend/src/pages/CaseChat.tsx
packages/frontend/src/components/expert/CasesSidebar.tsx
packages/frontend/src/components/expert/CaseProgressWidget.tsx
```
