# Orchestrator

Visual workflow automation platform with AI agent integration and Human-in-the-Loop capabilities.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

## Project Structure

```
orchestrator/
├── packages/
│   ├── shared/      # Shared types and schema
│   ├── backend/     # Express API + SQLite
│   └── frontend/    # React + React Flow
├── specs/           # Specifications
└── database.sqlite  # SQLite database
```

## Commands

```bash
pnpm dev           # Start both frontend and backend
pnpm dev:backend   # Start backend only
pnpm dev:frontend  # Start frontend only
pnpm build         # Build all packages
pnpm typecheck     # Type check all packages
```

## Tech Stack

- **Frontend**: React, TypeScript, React Flow, TailwindCSS, Zustand
- **Backend**: Express, TypeScript, Drizzle ORM
- **Database**: SQLite
