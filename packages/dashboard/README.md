# @open-code-review/dashboard

Local web interface for browsing OCR sessions, reviews, and Code Review Maps.

## Usage

The dashboard is launched through the CLI:

```bash
ocr dashboard                  # Start on default port (4173)
ocr dashboard --port 8080      # Custom port
ocr dashboard --no-open        # Don't auto-open browser
```

The dashboard is bundled into the `@open-code-review/cli` package and is not published separately.

## Features

- **Session browser** — View all review and map sessions with status, branch, and timestamps
- **Review detail** — Read individual reviewer findings, discourse, and final synthesis with rendered markdown
- **Review triage** — Set triage status on each review round (needs review, in progress, changes made, acknowledged, dismissed) with filtering and sorting
- **Map visualization** — Navigate Code Review Maps with rendered Mermaid dependency graphs
- **Live progress** — Watch active reviews in real-time via WebSocket
- **Command runner** — Execute OCR commands directly from the dashboard with tabbed terminal output
- **Notes** — Attach notes to sessions for tracking follow-up items
- **Post to GitHub** — Post review findings directly to your GitHub PR as a comment, with optional AI-powered human review translation
- **Human review translation** — Generate a natural, first-person rewrite of the multi-reviewer synthesis that sounds like a single developer wrote it, following Google's code review guidelines

## Post to GitHub

The review round page includes a "Post to GitHub" button that:

1. Checks `gh` auth status and finds the PR for the current branch
2. Offers two modes: post the team review as-is, or generate a human review translation
3. Human review mode streams tokens in real-time via Claude CLI, producing a natural first-person review
4. Preview, edit, and save drafts before posting to the PR

**Requirements:** GitHub CLI (`gh`) must be installed and authenticated. The branch must have an open PR.

## Architecture

```
src/
├── client/                   # React SPA
│   ├── features/             # Feature modules (sessions, reviews, map, commands, notes, home)
│   ├── components/           # Shared UI components (layout, markdown, status badges)
│   ├── providers/            # React Query, Socket.IO, theme
│   └── router.tsx            # React Router routes
├── server/                   # Express + Socket.IO
│   ├── prompts/              # LLM prompt generators
│   ├── routes/               # REST API endpoints
│   ├── services/             # Filesystem sync, markdown parsers
│   ├── socket/               # WebSocket handlers, command runner
│   └── db.ts                 # SQLite via sql.js
└── shared/
    └── types.ts              # Shared type definitions
```

**Client**: React 19, React Router 7, TanStack Query, Tailwind CSS 4, Mermaid, Socket.IO Client

**Server**: Express 4, Socket.IO 4, sql.js (SQLite), chokidar (filesystem watching)

The server reads from the same `.ocr/` directory and SQLite database (`ocr.db`) used by the CLI and review workflow. Filesystem changes are detected via chokidar and pushed to connected clients in real-time.

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (client + server with hot reload)
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

The dev server runs the Express backend and Vite dev server concurrently. The client proxies API requests to the backend.

## License

Apache-2.0
