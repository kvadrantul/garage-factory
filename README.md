# Garage Engine

Visual workflow automation platform with AI agent integration and Human-in-the-Loop (HITL) capabilities. Fork this repository to build your own workflow automation products.

## Features

- **Visual Workflow Editor** — Drag-and-drop canvas built with React Flow
- **Execution Engine** — Topological execution with conditional branching
- **Human-in-the-Loop** — Pause workflows for human approval, input, or selection
- **AI Agent Integration** — Built-in support for OpenAI and custom AI agents
- **Real-time Updates** — WebSocket-based execution monitoring
- **Dark Mode** — Full dark/light theme support

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kvadrantul/garage-engine.git
cd garage-engine

# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

## Project Structure

```
garage-engine/
├── packages/
│   ├── shared/       # @garage-engine/shared - Types and DB schema
│   ├── backend/      # @garage-engine/backend - Express API + Executor
│   └── frontend/     # @garage-engine/frontend - React UI
├── specs/            # Technical specifications
└── drizzle/          # Database migrations
```

## Available Nodes

### Triggers
- **Manual Trigger** — Start workflow manually
- **Webhook Trigger** — HTTP endpoint trigger
- **Schedule Trigger** — Cron-based scheduling

### Actions
- **HTTP Request** — Make HTTP calls with auth support
- **Code** — Execute JavaScript in sandboxed VM
- **Set** — Transform and set data

### Logic
- **If** — Conditional branching (8 operators)
- **Switch** — Multi-way branching
- **Merge** — Combine multiple inputs

### AI
- **Agent** — AI agent execution (OpenAI, custom)
- **HITL** — Human-in-the-Loop approval/input/selection

## Commands

```bash
pnpm dev              # Start frontend + backend
pnpm dev:backend      # Start backend only
pnpm dev:frontend     # Start frontend only
pnpm build            # Build all packages
pnpm typecheck        # Type check all packages
pnpm test             # Run tests
pnpm db:studio        # Open Drizzle Studio
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, React Flow, TailwindCSS, Zustand |
| Backend | Express, TypeScript, Drizzle ORM |
| Database | SQLite (via better-sqlite3) |
| Real-time | WebSocket (ws) |

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Frontend                        │
│  React Flow Canvas → Node Config → Execution UI │
└─────────────────────┬───────────────────────────┘
                      │ REST API + WebSocket
┌─────────────────────┴───────────────────────────┐
│                  Backend                         │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │  Executor   │ │   Graph     │ │   State   │ │
│  │  Runner     │ │  Resolver   │ │  Manager  │ │
│  └─────────────┘ └─────────────┘ └───────────┘ │
│  ┌─────────────────────────────────────────────┐│
│  │           Node Registry (Plugins)           ││
│  └─────────────────────────────────────────────┘│
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────┐
│              SQLite Database                     │
│  workflows │ executions │ credentials │ webhooks│
└─────────────────────────────────────────────────┘
```

## Extending / Forking

This repository is designed to be forked and extended for specific use cases:

### Adding Custom Nodes

```typescript
// packages/backend/src/nodes/custom/my-node.ts
import type { NodeRunner, NodeContext, NodeResult } from '@garage-engine/shared';

export const myCustomNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config;
    // Your logic here
    return { data: result };
  },
};

// Register in packages/backend/src/nodes/registry.ts
export const nodeRegistry: Record<string, NodeRunner> = {
  // ... existing nodes
  'my-custom-node': myCustomNode,
};
```

### Use Cases

- **Cloud Platform** — Add serverless function nodes, multi-tenant support
- **Desktop Agent** — Add filesystem nodes, local execution, Electron wrapper
- **Integration Platform** — Add API connectors, data transformation nodes

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
