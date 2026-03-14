# Setup & Development

## Tech Stack

| Layer            | Technology                        |
| ---------------- | --------------------------------- |
| Frontend         | SolidJS, Vite, vanilla CSS        |
| Backend          | Node.js, Express                  |
| Database         | SQLite (better-sqlite3, WAL mode) |
| LLM gateway      | OpenRouter API                    |
| Real-time        | WebSockets (ws)                   |
| Image processing | sharp                             |
| Package manager  | pnpm (workspaces monorepo)        |

## Project Structure

```sh
├── server/
│   ├── index.js             # Express app entry point
│   ├── auth.js              # Password auth + session management
│   ├── config.js            # Shared constants (default turn limits, etc.)
│   ├── db.js                # SQLite schema + init
│   ├── orchestrator.js      # Autonomous discussion engine (5s tick loop)
│   ├── llm.js               # OpenRouter API client
│   ├── prompts.js           # System prompt + message history builder
│   ├── startup-check.js     # Integrity checks on server start
│   ├── ws.js                # WebSocket server
│   ├── setup-password.js    # CLI tool to set the login password
│   └── routes/
│       ├── experts.js       # Expert CRUD + avatar processing
│       └── threads.js       # Thread CRUD + moderator actions
└── client/
    └── src/
        ├── App.jsx          # Root component + auth gate
        ├── api.js           # REST API client
        ├── ws.js            # WebSocket client
        ├── components/      # LoginScreen, Sidebar, ThreadView, etc.
        └── styles/          # Vanilla CSS (variables, layout, theme)
```

## Setup

**Prerequisites:** Node.js (v18+), pnpm

### 1. Install dependencies

```sh
pnpm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```env
OPENROUTER_API_KEY=sk-or-...    # Required — OpenRouter API key
PORT=4240                       # Optional — production server port (default: 4240)
VITE_API_PORT=8240              # Optional — dev API server port (default: 8240)
VITE_PORT=8242                  # Optional — dev Vite server port (default: 8242)
```

Both the server and the Vite dev server load from this single root `.env` file.

### 3. Set the login password

```sh
node server/setup-password.js
```

This interactive CLI prompt hashes your password and stores it in the SQLite database.

### 4. Seed expert personas (optional)

```sh
pnpm run seed
```

Loads 12 pre-built expert personas into the database. Existing experts with the same name are skipped.

### 5. Run in development

```sh
pnpm run dev
```

This starts both the API server (port 8240) and the Vite dev server (port 8242) with hot reload.

### 6. Production

Build the client, then start the server:

```sh
pnpm run build
pnpm run start
```

The server serves the built frontend and API on a single port (default 4240, override with `PORT`).

**Deploying to a server:**

```sh
./build-dist.sh
```

This builds the client, installs production server dependencies, and bundles everything into a `dist/` folder ready to upload. On the target, run `node server/index.js` to start. Only Node.js is required.

