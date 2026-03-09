# @open-code-review/dashboard

Local web interface for browsing OCR sessions, running reviews, triaging findings, and posting to GitHub. Bundled into the `@open-code-review/cli` package — not published separately.

## Getting Started

```bash
# 1. Install the CLI
npm install -g @open-code-review/cli

# 2. Initialize OCR in your project
cd your-project
ocr init

# 3. Launch the dashboard
ocr dashboard
```

```bash
ocr dashboard                  # Start on default port (4173)
ocr dashboard --port 8080      # Custom port
ocr dashboard --no-open        # Don't auto-open browser
```

## Features

- **Command Center** — Launch reviews and Code Review Maps directly from the dashboard with live terminal output

<p align="center">
  <img src="../../assets/ocr-tool-command-center.png" alt="OCR Dashboard Command Center" width="700" />
</p>

- **Review detail** — Read individual reviewer findings, discourse, and final synthesis with rendered markdown
- **Review triage** — Set status on each review round (needs review, in progress, changes made, acknowledged, dismissed) with filtering and sorting

<p align="center">
  <img src="../../assets/ocr-tool-focused-review.png" alt="OCR review detail with findings" width="700" />
</p>

- **Map visualization** — Navigate Code Review Maps with rendered Mermaid dependency graphs and file-level progress tracking

<p align="center">
  <img src="../../assets/ocr-tool-focused-code-review-map.png" alt="OCR Code Review Map" width="700" />
</p>

- **Live progress** — Watch active reviews in real-time via WebSocket
- **Post to GitHub** — Post review findings to your PR, with optional human review translation
- **Human review translation** — AI-rewrites multi-reviewer synthesis into a natural first-person voice following Google's code review guidelines
- **Address Feedback** — Copy a portable AI prompt or run an agent directly (Claude Code / OpenCode) to implement review feedback
- **Ask the Team** — AI-powered chat on review rounds and map runs for follow-up questions
- **Session notes** — Attach notes to sessions for tracking follow-up items

## Post to GitHub

The review round page includes a "Post to GitHub" button that:

1. Checks `gh` auth status and finds the PR for the current branch
2. Offers two modes: post the team review as-is, or generate a human review translation
3. Human review mode streams tokens in real-time via Claude CLI, producing a natural first-person review
4. Preview, edit, and save drafts before posting to the PR

<p align="center">
  <img src="../../assets/ocr-tool-translate-to-human-review-button.png" alt="Post Review to GitHub dialog" width="700" />
</p>

<p align="center">
  <img src="../../assets/ocr-tool-example-translated-human-review.png" alt="Human-voice review posted to GitHub PR" width="700" />
</p>

**Requirements:** GitHub CLI (`gh`) installed and authenticated. The branch must have an open PR.

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
