# Expert Agent System - Implementation Status

## Overview

The Expert Agent system allows users to chat with domain-specific AI agents that can execute workflow scenarios. This document tracks what's implemented and what remains to be done.

**Spec file:** `.qoder/specs/expert-agent-mvp-architecture.md`

---

## IMPLEMENTED (Working)

### 1. Database Schema
**File:** `packages/shared/src/schema.ts`

4 new tables added:
- `domains` - expertise areas (Legal Office, HR, etc.)
- `scenarios` - workflow-to-tool mappings (schema exists but not used yet)
- `cases` - chat sessions within a domain
- `caseSteps` - conversation history (user_message, assistant_message, etc.)

### 2. Domain CRUD API
**File:** `packages/backend/src/api/expert.ts`

```
GET    /api/expert/domains          - List all domains
POST   /api/expert/domains          - Create domain
GET    /api/expert/domains/:id      - Get domain
PUT    /api/expert/domains/:id      - Update domain
DELETE /api/expert/domains/:id      - Delete domain
```

Domain fields:
- `name` - display name ("Legal Office")
- `slug` - URL-friendly ID ("legal-office")
- `icon` - emoji or icon name
- `description` - what this domain handles
- `agentId` - **existing** OpenClaw agent ID (e.g., "main")

### 3. Case CRUD API
**File:** `packages/backend/src/api/expert.ts`

```
GET    /api/expert/cases            - List cases (filter by domain_id)
POST   /api/expert/cases            - Create case
GET    /api/expert/cases/:id        - Get case with domain info
```

### 4. Chat API
**File:** `packages/backend/src/api/chat.ts`

```
POST   /api/chat/send               - Send message to agent
GET    /api/chat/history/:case_id   - Get chat history
```

**How it works:**
1. Receives `{ case_id, message }`
2. Looks up domain's `agentId`
3. Spawns OpenClaw CLI: `openclaw agent --agent <agentId> --message <msg> --json`
4. Parses JSON response from `result.payloads[0].text`
5. Saves both user message and agent response as `case_steps`
6. Returns response to frontend

### 5. Frontend Pages
**Files:**
- `packages/frontend/src/pages/DomainList.tsx` - domain grid
- `packages/frontend/src/pages/CaseList.tsx` - cases for a domain
- `packages/frontend/src/pages/CaseChat.tsx` - chat interface

**Routes in App.tsx:**
```
/domains                    - DomainList
/cases                      - CaseList (with domain_id query param)
/cases/:id/chat             - CaseChat
```

### 6. Navigation
**File:** `packages/frontend/src/components/AppHeader.tsx`

Added "Expert Agent" link to header navigation → goes to `/domains`

### 7. Frontend API Client
**File:** `packages/frontend/src/api/client.ts`

Added:
- `domainsApi` - CRUD for domains
- `scenariosApi` - CRUD for scenarios (endpoints exist but not fully wired)
- `casesApi` - CRUD for cases
- `chatApi` - send/history

---

## NOT IMPLEMENTED (TODO)

### 1. Scenario System (Agent Tools)
**Spec Phase 3-4**

The core feature that allows agents to execute workflows is NOT done.

**What's missing:**

#### a) Scenario CRUD API
Endpoints exist but are basic:
```
GET    /api/expert/domains/:domainId/scenarios
POST   /api/expert/domains/:domainId/scenarios
PUT    /api/expert/domains/:domainId/scenarios/:id
DELETE /api/expert/domains/:domainId/scenarios/:id
```

Need to add:
- Input schema validation
- Risk class handling (read/write/dangerous)
- Workflow existence check

#### b) Skill Generator
**File to create:** `packages/backend/src/services/skill-generator.ts`

When a scenario is created, should generate OpenClaw skill files:

```
~/.openclaw/workspace-{agentId}/skills/{toolName}/
├── manifest.json    - tool name, description, parameters schema
└── index.mjs        - calls back to bridge API
```

**manifest.json example:**
```json
{
  "name": "check_employee_leave",
  "description": "Checks employee leave balance",
  "parameters": {
    "type": "object",
    "properties": {
      "employeeId": { "type": "string" }
    },
    "required": ["employeeId"]
  }
}
```

**index.mjs example:**
```javascript
export default async function handler(args, ctx) {
  const response = await fetch('http://localhost:3000/api/expert/bridge/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toolName: 'check_employee_leave',
      inputs: args,
      caseId: ctx.env.CASE_ID
    })
  });
  return response.json();
}
```

#### c) Bridge API (Sync Executor)
**File to create:** `packages/backend/src/services/sync-executor.ts`

Endpoint:
```
POST /api/expert/bridge/execute
{ toolName, inputs, caseId }
```

Should:
1. Look up scenario by toolName → get workflowId
2. Execute workflow synchronously (wait for completion)
3. Return result to the skill (which returns to agent)

**Sync execution pattern:**
```javascript
async function syncExecute(workflowId, triggerData, timeoutMs = 60000) {
  // 1. Start execution
  const executionId = await executionService.executeWorkflow(workflowId, 'manual', triggerData);
  
  // 2. Wait for completion via event bus
  return new Promise((resolve) => {
    executionEventBus.on('execution:completed', (data) => {
      if (data.executionId === executionId) {
        resolve({ status: 'completed', outputs: data.outputs });
      }
    });
    
    executionEventBus.on('execution:failed', (data) => {
      if (data.executionId === executionId) {
        resolve({ status: 'failed', error: data.error });
      }
    });
    
    setTimeout(() => resolve({ status: 'failed', error: 'timeout' }), timeoutMs);
  });
}
```

#### d) Agent Provisioner
**File to create:** `packages/backend/src/services/agent-provisioner.ts`

Currently domains just reference existing OpenClaw agents by ID.

Full implementation should:
1. Create new agent workspace: `~/.openclaw/workspace-{agentId}/`
2. Write `IDENTITY.md` with domain-specific instructions
3. Write `openclaw.json` with tool allow list
4. Register agent with OpenClaw

### 2. Scenario Management UI
**Files to create:**
- `packages/frontend/src/pages/ScenarioList.tsx`
- `packages/frontend/src/pages/ScenarioForm.tsx`

Should allow:
- List scenarios for a domain
- Create scenario (pick workflow, define tool name/description/schema)
- Edit/delete scenarios
- Enable/disable scenarios

### 3. HITL in Chat
**Spec Phase 5**

When a workflow triggers HITL (approval/input/selection), should:
1. Return `{ status: 'waiting_hitl', hitlRequestId }` from bridge
2. Display HITL card inline in chat
3. User responds in chat
4. Resume workflow execution

### 4. Case Step Logging for Tool Calls
Currently only logs `user_message` and `assistant_message`.

Should also log:
- `tool_call` - when agent calls a tool
- `tool_result` - workflow execution result
- `hitl_request` - HITL pause
- `hitl_response` - user's HITL response

### 5. OpenClaw Session Management
The `openclawSessionId` field exists on cases but isn't used.

Should:
- Create session when case is created
- Pass session ID to agent for conversation continuity
- Store session ID in case record

---

## File Structure

### Existing Files (Modified)
```
packages/shared/src/schema.ts          - Added 4 tables
packages/shared/src/types.ts           - Added interfaces
packages/backend/src/index.ts          - Mounted expertRouter, chatRouter
packages/frontend/src/App.tsx          - Added /domains, /cases routes
packages/frontend/src/api/client.ts    - Added domainsApi, casesApi, chatApi
packages/frontend/src/components/AppHeader.tsx - Added Expert Agent nav link
```

### New Files (Created)
```
packages/backend/src/api/expert.ts     - Domain/Scenario/Case CRUD
packages/backend/src/api/chat.ts       - Chat send/history + OpenClaw CLI
packages/frontend/src/pages/DomainList.tsx
packages/frontend/src/pages/CaseList.tsx
packages/frontend/src/pages/CaseChat.tsx
```

### Files to Create
```
packages/backend/src/services/sync-executor.ts      - Synchronous workflow execution
packages/backend/src/services/skill-generator.ts   - Generate OpenClaw skill files
packages/backend/src/services/agent-provisioner.ts - Create OpenClaw agents
packages/frontend/src/pages/ScenarioList.tsx       - Scenario management UI
packages/frontend/src/pages/ScenarioForm.tsx       - Create/edit scenario
```

---

## Testing

### What Works Now
1. Create domain with existing OpenClaw agent ID (e.g., "main")
2. Create case in domain
3. Chat with agent - messages sent and received
4. Chat history persisted and displayed

### Test Commands
```bash
# Start servers
cd garage-factory
pnpm --filter @garage-engine/backend dev
pnpm --filter @garage-engine/frontend dev

# Check OpenClaw agent
openclaw agent list
openclaw agent --agent main --message "Hello" --json

# Test API
curl http://localhost:3000/api/expert/domains
curl -X POST http://localhost:3000/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{"case_id": "xxx", "message": "Hello"}'
```

---

## Priority for Next Agent

1. **Sync Executor** - Core mechanism for tool-calling
2. **Skill Generator** - Creates tool files for OpenClaw
3. **Bridge API endpoint** - `/api/expert/bridge/execute`
4. **Scenario UI** - Let users create/manage scenarios
5. **HITL in chat** - Handle workflow pauses in chat

The spec file has detailed implementation guidance for each component.
