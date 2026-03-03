# Orchestrator MVP - Product Specification

## Overview

Orchestrator is a visual workflow automation platform with native support for AI agents (OpenClaw) and Human-in-the-Loop (HITL) capabilities. It enables building deterministic business processes that can incorporate autonomous AI agent steps with human oversight.

## Vision

Create a hybrid automation platform that combines:
- **Deterministic workflows** (like n8n) for predictable, auditable processes
- **AI Agent integration** (OpenClaw) for intelligent, adaptive steps
- **Human-in-the-Loop** for critical decision points and oversight

## Target Users

- Developers building business automation
- Teams needing AI-augmented workflows
- Single-user local deployment (MVP)

## Core Features

### 1. Visual Canvas Editor
- Drag-and-drop node placement
- Visual connection between nodes
- Real-time execution visualization
- Zoom, pan, selection

### 2. Workflow Execution
- In-process execution (no external queue)
- Sequential and parallel node execution
- Error handling and retry logic
- Execution history and logs

### 3. Base Nodes
- **Triggers**: Webhook, Schedule (Cron), Manual
- **Logic**: If/Switch, Merge, Split
- **Actions**: HTTP Request, Code/Function
- **Special**: Agent (OpenClaw), HITL Approval

### 4. Human-in-the-Loop
- Pause workflow for human decision
- Approval/Rejection UI
- Custom input forms
- Timeout handling

### 5. Agent Integration
- OpenClaw agent invocation
- Pass context to agent
- Receive agent response
- Stream agent "thinking" to UI (optional)

## Non-Goals (MVP)

- Multi-user / Teams
- Role-based access control
- PostgreSQL / Redis
- Workflow versioning
- 300+ integrations (add later)
- Enterprise features
- Horizontal scaling

## Success Metrics

1. Can create workflow visually on canvas
2. Can execute workflow and see real-time status
3. Can use Agent node to call OpenClaw
4. Can pause for human approval (HITL)
5. Data persists in SQLite

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, TypeScript, React Flow, TailwindCSS |
| Backend | Node.js, Express/Fastify, TypeScript |
| Database | SQLite (better-sqlite3 or Drizzle) |
| Real-time | WebSocket (ws) |
| Agent | OpenClaw CLI |

## Project Structure

```
orchestrator/
├── packages/
│   ├── frontend/        # React app
│   ├── backend/         # Express API
│   ├── nodes/           # Node implementations
│   └── shared/          # Shared types
├── specs/               # Specifications
├── database.sqlite      # Local database
└── package.json         # Monorepo config
```

## Milestones

### M1: Foundation
- [ ] Project setup (monorepo, build)
- [ ] Basic backend with SQLite
- [ ] Basic frontend with empty canvas
- [ ] WebSocket connection

### M2: Canvas Editor
- [ ] React Flow integration
- [ ] Node palette (sidebar)
- [ ] Add/remove/connect nodes
- [ ] Save/load workflows

### M3: Execution Engine
- [ ] Workflow executor (state machine)
- [ ] Node runner interface
- [ ] Execution history
- [ ] Real-time status updates

### M4: Base Nodes
- [ ] HTTP Request node
- [ ] Code/Function node
- [ ] If/Switch node
- [ ] Webhook trigger
- [ ] Schedule trigger

### M5: HITL & Agent
- [ ] HITL node (approval)
- [ ] Agent node (OpenClaw)
- [ ] HITL UI widgets
- [ ] Agent response handling

### M6: Polish
- [ ] Error handling
- [ ] Execution logs
- [ ] UI refinements
- [ ] Documentation

## Risks

1. **Canvas complexity** - React Flow learning curve
2. **Executor edge cases** - Parallel execution, error handling
3. **OpenClaw integration** - CLI spawning, timeout handling

## References

- n8n (workflow engine architecture)
- React Flow (canvas library)
- OpenClaw (agent framework)
- aixoffice (HITL patterns)
