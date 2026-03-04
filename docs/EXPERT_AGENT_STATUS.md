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

All Phase 5 (MVP) features are now implemented.

### Architecture TODO - Post-MVP Roadmap

Below are the architectural gaps identified after MVP completion. Ordered by impact.

#### 1. Async Execution Queue + Polling
**Problem:** Entire chat/send request blocks synchronously (agent call + workflow execution). Timeout 120s for agent, 5 min for workflow. Server can't handle concurrent users.
**Solution:**
- Introduce BullMQ (or similar) job queue for agent interactions
- POST /api/chat/send returns immediately with `{job_id, status: "processing"}`
- Frontend polls GET /api/chat/status/:job_id or uses SSE for updates
- Sync-executor moves from blocking Promise to queue-based job
- caseSteps get written incrementally as job progresses
**Files to create/modify:** New `packages/backend/src/services/job-queue.ts`, modify `chat.ts`, add SSE endpoint or WebSocket channel
**Impact:** Enables concurrent users, removes timeouts, enables long-running workflows

#### 2. Streaming Agent Responses (SSE)
**Problem:** User stares at spinner for 10-60 seconds. No feedback until agent fully finishes.
**Solution:**
- Replace CLI spawn with OpenClaw streaming API (if available) or implement Server-Sent Events
- Backend pushes partial tokens to frontend as agent generates
- Frontend renders tokens incrementally in assistant_message bubble
- Tool call detection happens on completed chunks
**Files to create/modify:** New SSE endpoint in `chat.ts`, frontend EventSource client in `CaseChat.tsx`
**Depends on:** Async execution queue (item 1) or can be done standalone with SSE from sync endpoint

#### 3. Replace CLI Spawn with API Client
**Problem:** Each message spawns `openclaw agent` as new OS process (~100-200ms overhead). No connection reuse, no streaming, no parallel calls. Doesn't scale.
**Solution:**
- Use OpenClaw HTTP/gRPC API client instead of CLI spawn
- Maintain persistent connection per agent session
- Enable streaming token delivery
- Reduce latency from ~200ms to ~10ms per call
**Files to modify:** `chat.ts` (callOpenClawAgent function), potentially `agent-provisioner.ts`
**Impact:** 10-20x latency improvement, enables streaming, reduces server load

#### 4. File Upload & Dynamic File Context
**Problem:** Files (e.g., Excel bank statements) are referenced by hardcoded absolute paths in workflow node configs. Users can't upload files through chat or attach them to a case. Agent has no way to pass a user-provided file to a tool.
**Solution:**
- **File upload endpoint:** POST /api/cases/:id/upload -> saves to `uploads/{caseId}/{filename}`, returns path
- **Chat attachment UI:** Drag-drop or paperclip button in CaseChat input area. File appears as `file_upload` case step
- **File context in case:** Case record gets `files[]` array (or separate `caseFiles` table) tracking uploaded files
- **Agent sees files:** When building tool context, include list of uploaded files with paths. Agent can reference them in tool_call inputs
- **Dynamic bridgeInputs:** Workflow nodes read filePath from `$input.bridgeInputs.filePath` instead of static config
- **New case step type:** `file_upload` with content `{ fileName, filePath, mimeType, size }`
**Files to create/modify:** New upload endpoint in `expert.ts`, new `uploads/` storage dir, modify `chat.ts` (inject file context), modify `CaseChat.tsx` (file attachment UI), schema migration (caseFiles table or extend caseSteps)
**Impact:** Users can work with their own files. Enables real-world usage beyond demo data

#### 5. Composable Atomic Nodes for Data Operations
**Problem:** Current custom nodes are monolithic (e.g., `excel-bik-sum` does read + filter + aggregate in one blob of code). Can't reuse parts. Adding a new operation means writing a new custom node from scratch.
**Solution:**
- Build reusable atomic nodes following n8n pattern:
  - `read-excel` (already exists) -- reads any Excel file, returns rows
  - `filter-rows` -- filter by column condition (equals, contains, greater than, etc.)
  - `aggregate` -- sum/count/avg/min/max by specified columns, optional group-by
  - `sort-rows` -- sort by column(s)
  - `select-columns` -- pick/rename columns
  - `format-output` -- format results as table/summary/markdown
- Each node accepts dynamic config via expressions (`{{$input.bridgeInputs.column}}`)
- Workflows compose these nodes into domain-specific pipelines
**Files to create:** New node manifests in `packages/backend/src/nodes/manifests/`, or custom_nodes in DB
**Impact:** New data operations assembled from existing blocks instead of writing code. Admin builds workflows visually in editor

#### 6. Input Validation & Output Schema Enforcement
**Problem:** No validation on tool inputs before workflow execution. Output schemas defined in scenarios but never enforced. Garbage in = cryptic workflow errors.
**Solution:**
- Validate inputs against scenario's `inputsSchema` in bridge.ts before execution
- Validate/transform outputs against `outputsSchema` after execution
- Return structured validation errors to agent so it can retry with correct inputs
**Files to modify:** `bridge.ts`, `sync-executor.ts`
**Impact:** Better error messages, fewer wasted executions, agent can self-correct

#### 7. Authentication & Authorization
**Problem:** Expert API endpoints have no auth. Anyone can call POST /api/chat/send, create domains, delete cases.
**Solution:**
- Auth middleware for expert API routes (JWT or session-based)
- User ownership of cases (userId field in cases table)
- Domain-level access control (who can chat with which domain)
- Rate limiting per user
**Files to modify:** New auth middleware, schema migration (add userId), all expert API routes
**Impact:** Required for any multi-user deployment

#### 8. Agent Memory & Cross-Case Learning
**Problem:** Each case is isolated. Agent has session memory within a case but no knowledge of past cases, patterns, or domain-specific learnings.
**Solution:**
- Case summarization on close (agent generates summary, stored in cases.summary)
- Vector DB (Pinecone/ChromaDB) for semantic search across case history
- RAG: inject relevant past case summaries into agent context
- Domain knowledge base: upload docs/PDFs that get embedded and searchable
**Files to create:** New `packages/backend/src/services/memory-service.ts`, vector DB integration, embedding pipeline
**Impact:** Agent gets smarter over time, handles similar cases better

#### 9. Multi-Agent Orchestration
**Problem:** One domain = one agent. Complex tasks requiring multiple specializations (e.g., "review contract" needs legal + financial + compliance agents) can't be delegated.
**Solution:**
- Agent router: meta-agent that delegates to specialist domain agents
- Inter-agent protocol: agent A can invoke agent B as a tool
- Shared context/blackboard for multi-agent collaboration
- Orchestration patterns: sequential, parallel, hierarchical
**Files to create:** New `packages/backend/src/services/agent-router.ts`, new node type "agent-call"
**Impact:** Enables complex multi-domain workflows

#### 10. Observability & Monitoring
**Problem:** Console logs only. No way to diagnose slow responses, track tool success rates, or detect failures in production.
**Solution:**
- Structured logging (pino/winston) with correlation IDs
- OpenTelemetry tracing: trace from HTTP request → agent call → workflow execution → response
- Metrics: response time P50/P95, tool call success rate, agent error rate
- Dashboard (Grafana) for monitoring
**Files to create:** New `packages/backend/src/services/telemetry.ts`, instrument all API routes
**Impact:** Required for production operations

#### 11. Error Recovery & Resilience
**Problem:** If tool fails, agent gets error message but there's no retry logic, no circuit breaker, no fallback. Failed executions don't get replayed.
**Solution:**
- Configurable retry policy per scenario (max retries, backoff)
- Circuit breaker: if tool fails N times, mark as degraded
- Dead letter queue for failed executions
- Graceful degradation: agent knows tool is unavailable and adjusts
**Files to modify:** `sync-executor.ts`, `chat.ts` tool-calling loop, new `packages/backend/src/services/circuit-breaker.ts`
**Impact:** System stays functional when individual tools break

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
