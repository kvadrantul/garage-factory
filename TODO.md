# Garage Tools -- TODO: Remaining Work

Items below are needed to complete the MVP as described in `specs/SPEC.md`.
Ordered by priority -- higher items unblock more functionality.

---

## ~~1. Credentials CRUD API~~ DONE

Completed. See `packages/backend/src/api/credentials.ts`.

---

## ~~2. Frontend: Executions Page~~ DONE

Completed. See `packages/frontend/src/pages/ExecutionList.tsx` and `ExecutionDetail.tsx`.

---

## ~~3. Frontend: HITL Response Panel~~ DONE

Completed. See:
- `packages/frontend/src/components/panels/HITLPanel.tsx` - popup panel in editor
- `packages/frontend/src/pages/HITLList.tsx` - standalone page at `/hitl`

---

## ~~4. Webhook Handler~~ DONE

Completed. See `packages/backend/src/webhooks/webhook-handler.ts`.
- Route: `POST /webhooks/:path` triggers workflow execution
- Workflow activate registers webhooks, deactivate unregisters them

---

## ~~5. Scheduler (Cron)~~ DONE

Completed. See `packages/backend/src/services/scheduler.ts`.
- CronJob management for schedule-trigger nodes
- Auto-loads active workflows on server start
- Registers/unregisters on workflow activate/deactivate

---

## ~~6. Code Node: Async Support~~ DONE

Completed. Rewrote `packages/backend/src/nodes/actions/code.ts`:
- Proper async/await with Promise.race for timeout
- Console.log/warn/error capture in output
- `$result` variable for returning data

---

## ~~7. Agent Node: OpenClaw Integration~~ DONE

Completed. Updated `packages/backend/src/nodes/ai/agent.ts`:
- OpenClaw CLI mode: spawns `openclaw agent` with streaming output
- OpenAI mode: direct API call with temperature support
- Config: provider, agentId, model, systemPrompt, message, temperature, timeout
- Frontend config panel updated with all fields

---

## ~~8. Frontend: Execution Visualization in Editor~~ DONE

Completed. Updated `WorkflowEditor.tsx` and `WorkflowNode.tsx`:
- Node output data shown on click (expandable panel)
- Execution duration displayed per node
- Edge animation on node completion (green for success, red for error)
- Error messages shown on nodes

---

## ~~9. Error Handling Policy~~ DONE

Completed. Updated `execution-runner.ts` and `state-manager.ts`:
- `errorHandling: 'continue'` - node errors don't stop workflow, downstream is skipped
- `errorHandling: 'stop'` (default) - current behavior, propagates error
- `retryOnFail` + `maxRetries` - retries failed nodes with exponential backoff

---

## 10. Tests

**Priority**: Low
**Effort**: Medium

No automated tests exist yet.

Tasks:
- [ ] Add vitest to backend package
- [ ] Unit tests for `GraphResolver` (topological sort, start nodes, downstream)
- [ ] Unit tests for `StateManager`
- [ ] Unit tests for individual node runners (if, switch, set, merge)
- [ ] Integration test for `ExecutionRunner` with a multi-node workflow
- [ ] Frontend: vitest + testing-library for component tests (optional for MVP)

---

## Quick Reference: Key Files

When working on the codebase, these are the most important files:

| Purpose | File |
|---------|------|
| All types | `packages/shared/src/types.ts` |
| DB schema | `packages/shared/src/schema.ts` |
| DB init + connection | `packages/backend/src/db/index.ts` |
| Server entry | `packages/backend/src/index.ts` |
| Execution engine | `packages/backend/src/executor/execution-runner.ts` |
| Node registry | `packages/backend/src/nodes/registry.ts` |
| ExecutionService | `packages/backend/src/services/execution-service.ts` |
| Frontend routes | `packages/frontend/src/App.tsx` |
| Canvas editor | `packages/frontend/src/pages/WorkflowEditor.tsx` |
| Custom node UI | `packages/frontend/src/components/nodes/WorkflowNode.tsx` |
| API client | `packages/frontend/src/api/client.ts` |
| State store | `packages/frontend/src/stores/workflowStore.ts` |
