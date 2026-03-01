# Mastermind Group

A meeting of AI-simulated minds.

Configure AI "expert" personas — each backed by a different LLM via OpenRouter — and set them loose in structured, round-robin discussions on any topic. Observe the conversation in real time, interject as a moderator, request a wrap-up, or extend the debate.

## Features

- **Expert personas** — Create named AI experts with descriptions, avatar images, and individually assigned LLM models
- **Threaded discussions** — Start discussions with a topic, pick which experts to invite, and set a turn limit to control costs
- **Autonomous orchestration** — Discussions continue server-side whether the browser is open or not
- **Real-time updates** — WebSocket-powered live message streaming
- **Moderator controls** — Interject with follow-up questions, wrap up for concluding remarks, extend turns, or pause/resume
- **Prompt engineering** — 12-rule system prompt enforces critical thinking, genuine engagement, concise responses, and convergence toward actionable conclusions
- **Single-user auth** — Password login with scrypt hashing and server-side brute-force throttling (5-minute cooldown)

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
│   ├── db.js                # SQLite schema + init
│   ├── orchestrator.js      # Autonomous discussion engine (5s tick loop)
│   ├── llm.js               # OpenRouter API client
│   ├── prompts.js           # System prompt + message history builder
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

```sh
cp .env.example .env  # or create .env manually
```

```env
OPENROUTER_API_KEY=sk-or-...
PORT=8242
```

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

This starts both the API server (port 8240) and the Vite dev server (port 8243) with hot reload.

### 6. Production

```sh
cd client && pnpm exec vite build
pnpm run start
```

The server serves the built client bundle from `client/dist/` on the same port as the API.

## Usage

1. Open the app and log in with your password
2. Go to **Manage Experts** and create at least 2 experts (name, description/persona, OpenRouter model string like `anthropic/claude-sonnet-4`)
3. Click **New Discussion**, set a topic, select your experts, and choose a max turn count
4. Watch the discussion unfold in real time — the orchestrator drives it automatically
5. Use the moderator controls to interject, wrap up, extend turns, or pause
