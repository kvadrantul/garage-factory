# Garage Tools

Visual workflow automation platform with AI agent integration and Human-in-the-Loop (HITL) capabilities. Fork this repository to build your own workflow automation products.

## Features

- **Visual Workflow Editor** — Drag-and-drop canvas built with React Flow
- **Custom Node Builder** — Create custom nodes via UI constructor or JSON manifests
- **Execution Engine** — Topological execution with conditional branching
- **Expression Support** — Dynamic values with `{{ $input }}`, `{{ $node["name"].json }}`, `{{ $vars }}`, `{{ $env }}`
- **Human-in-the-Loop** — Pause workflows for human approval, input, or selection
- **AI Agent Integration** — Built-in support for OpenAI and custom AI agents
- **Real-time Updates** — WebSocket-based execution monitoring
- **Dark Mode** — Full dark/light theme support

## Quick Start

```bash
# Clone the repository
git clone https://github.com/kvadrantul/garage-tools.git
cd garage-tools

# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

## Project Structure

```
garage-tools/
├── packages/
│   ├── shared/       # @garage-tools/shared - Types and DB schema
│   ├── backend/      # @garage-tools/backend - Express API + Executor
│   └── frontend/     # @garage-tools/frontend - React UI
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

### Custom Nodes
- **Read Excel** — Parse .xls/.xlsx files (built-in)
- **+ Create Your Own** — Via UI constructor or JSON manifests

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

## Expressions

Use `{{ }}` syntax in node configuration for dynamic values:

```javascript
// Access upstream node output
{{ $input }}                    // Full output from previous node
{{ $input.body.users[0].name }} // Nested path access
{{ $json }}                     // Alias for $input

// Reference specific node output
{{ $node["HTTP Request"].json.data }}

// Workflow variables & environment
{{ $vars.apiKey }}              // Workflow-level variables
{{ $env.DATABASE_URL }}         // Environment variables
```

Expressions are resolved at runtime during workflow execution.

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
│  custom_nodes │ hitl_requests │ execution_nodes │
└─────────────────────────────────────────────────┘
```

## Custom Node Builder

Create custom workflow nodes without modifying core code. Two approaches available:

### UI Constructor

Navigate to **Custom Nodes** in the header menu to access the visual builder:

1. **Metadata** — Set ID, name, description, category, version
2. **Icon & Color** — Choose from 150+ icons and 8 color presets
3. **Properties** — Define configuration fields (string, number, boolean, select, json, code)
4. **Code** — Write JavaScript with access to `require()`, `config`, `$input`, `helpers`
5. **Test** — Run with sample input before saving

### JSON Manifest

Create a file in `packages/backend/src/nodes/manifests/`:

```json
{
  "id": "read-excel",
  "name": "Read Excel",
  "description": "Parse Excel files from disk",
  "version": "1.0.0",
  "category": "actions",
  "icon": "FileSpreadsheet",
  "color": "green",
  "inputs": [{ "name": "main", "type": "main" }],
  "outputs": [{ "name": "main", "type": "main" }],
  "properties": [
    {
      "name": "filePath",
      "displayName": "File Path",
      "type": "string",
      "required": true,
      "placeholder": "/path/to/file.xlsx"
    },
    {
      "name": "hasHeader",
      "displayName": "First Row is Header",
      "type": "boolean",
      "default": true
    }
  ],
  "code": "const XLSX = require('xlsx'); const wb = XLSX.readFile(config.filePath); return { rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) };"
}
```

### Code Environment

Custom node code has access to:

| Variable | Description |
|----------|-------------|
| `config` | Node configuration (from properties) |
| `$input` | Data from upstream node |
| `$inputs` | Array of all inputs |
| `require()` | Node.js require for npm packages |
| `helpers.httpRequest()` | HTTP helper |
| `helpers.getCredential()` | Load stored credentials |
| `execution` | Execution metadata (id, workflowId) |
| `console.log()` | Captured in node output logs |

### API Endpoints

```bash
GET    /api/custom-nodes          # List all custom nodes
POST   /api/custom-nodes          # Create new custom node
GET    /api/custom-nodes/:id      # Get single node
PUT    /api/custom-nodes/:id      # Update node
DELETE /api/custom-nodes/:id      # Delete node (user-created only)
POST   /api/custom-nodes/:id/toggle  # Enable/disable
POST   /api/custom-nodes/:id/test    # Test execution
```

## Extending / Forking

This repository is designed to be forked and extended for specific use cases:

### Adding Custom Nodes

**Option 1: UI Constructor** (recommended for most cases)
- Navigate to Custom Nodes → Create New
- Define properties, write code, test, save
- No deployment needed — stored in database

**Option 2: JSON Manifest** (for built-in nodes)
- Create file in `packages/backend/src/nodes/manifests/*.json`
- Loaded automatically on server start

**Option 3: TypeScript Runner** (for complex integrations)
```typescript
// packages/backend/src/nodes/actions/my-node.ts
import type { NodeRunner, NodeContext, NodeResult } from '@garage-tools/shared';

export const myCustomNode: NodeRunner = {
  async execute(context: NodeContext): Promise<NodeResult> {
    const config = context.node.data.config;
    // Your logic here
    return { data: result };
  },
};

// Register in packages/backend/src/nodes/registry.ts
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
