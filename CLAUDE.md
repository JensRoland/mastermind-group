# CLAUDE.md

## Project Overview

Mastermind Group — an AI-powered roundtable discussion app where multiple LLM-simulated expert personas debate topics autonomously. Built as a pnpm monorepo with a SolidJS frontend and Node.js/Express backend.

## Tech Stack

- **Frontend:** SolidJS, Vite, vanilla CSS (dark theme, CSS custom properties)
- **Backend:** Node.js, Express, ES modules (`"type": "module"`)
- **Database:** SQLite via better-sqlite3 (WAL mode, foreign keys enabled)
- **Real-time:** WebSockets (ws)
- **LLM:** OpenRouter API (model-agnostic)
- **Package manager:** pnpm (with workspaces)
- **Image processing:** sharp (avatar crop/resize)

## Commands

```bash
pnpm install                      # Install all dependencies
pnpm run dev                      # Start both client + server (dev mode)
pnpm run dev:server               # Server only (node --watch, port 8240)
pnpm run dev:client               # Client only (Vite, port 8242)
pnpm run build                    # Build client for production
pnpm run start                    # Run production server (port 4240)
pnpm run seed                     # Seed 12 expert personas into DB
node server/setup-password.js     # Set login password (interactive CLI)
```

## Project Structure

```
client/src/
  App.jsx                  # Root component, auth gate, routing
  api.js                   # REST client (fetch wrapper)
  ws.js                    # WebSocket client with auto-reconnect
  components/              # SolidJS components (one per file)
  styles/                  # Vanilla CSS (variables.css for theming)

server/
  index.js                 # Express entry point, route registration, WS init
  db.js                    # SQLite connection, schema creation
  auth.js                  # Password auth (scrypt), sessions, throttling
  orchestrator.js          # Autonomous discussion engine (5s tick loop)
  llm.js                   # OpenRouter API client
  prompts.js               # System prompt builder
  ws.js                    # WebSocket server, per-thread subscriptions
  routes/experts.js        # Expert CRUD + avatar processing
  routes/threads.js        # Thread CRUD + moderator actions
  startup-check.js         # Integrity checks on server start

data/                      # SQLite database files (gitignored)
public/                    # Static assets (avatars)
```

## Code Conventions

- ES modules throughout (`import`/`export`, no CommonJS)
- camelCase for variables/functions
- SolidJS primitives: `createSignal`, `<Show>`, `<For>`
- Parameterized SQL queries (?) — never interpolate user input
- Database transactions via `db.transaction()` for atomic operations
- CSS: BEM-like naming, custom properties (`--color-*`, `--spacing-*`)
- Error handling: try/catch with console logging; API errors return JSON with status codes

## Environment Variables

- `OPENROUTER_API_KEY` (required) — OpenRouter API key
- `PORT` (optional, default 4240) — production server port
- `VITE_API_PORT` (optional, default 8240) — dev API proxy port
- `VITE_PORT` (optional, default 8242) — dev Vite port

## Architecture Notes

- The orchestrator runs server-side on a 5-second tick, processing active threads independently of client connections
- Round-robin expert selection based on turn count
- WebSocket broadcasts push live messages; clients subscribe per-thread
- Single-user auth with scrypt password hashing and brute-force throttling
- No test framework currently configured
