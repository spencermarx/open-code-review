# Change: Add OCR Dashboard

## Why

OCR currently tracks code review and map workflow state via `state.json` files and filesystem artifacts rendered to terminal by `ocr progress`. This architecture has five fundamental limitations: no persistent progress tracking (terminal output is ephemeral), no interactive navigation (static markdown maps), no structured finding management (no triage workflow), split state with no single source of truth (`state.json` + filesystem + ad-hoc reconciliation), and no operational control plane (no way to trigger CLI commands or inspect orchestration state outside the terminal).

## What Changes

- **New `dashboard` capability** — Local web application (Express/Hono + Socket.IO server, React client) providing interactive UI for session browsing, review round inspection, Code Review Map navigation with dependency graphs, finding triage, markdown artifact rendering, real-time progress tracking, and CLI command execution
- **New `sqlite-state` capability** — **BREAKING** migration from `state.json` to SQLite (`.ocr/data/ocr.db`) as the single source of truth for all OCR state. Three-layer schema: workflow state (agents via `ocr state`), artifact layer (FilesystemSync), user interaction layer (dashboard). Shared DB access module for CLI and dashboard. Versioned migration system.
- **New `ocr dashboard` CLI command** — Starts local HTTP + Socket.IO server, opens browser, serves embedded dashboard
- **Modified `ocr progress`** — Reads from SQLite instead of `state.json` (with fallback during migration)
- **Modified `ocr state` commands** — Write to SQLite instead of (or in addition to) `state.json`; insert immutable events into `orchestration_events` table
- **Modified session state tracking** — SQLite is authoritative; `state.json` becomes a backward-compatible side-effect
- **FilesystemSync service** — Parses markdown artifacts from `.ocr/sessions/` into granular SQLite tables on dashboard startup and via chokidar file watching
- **Real-time updates** — All dashboard data updates are push-based via Socket.IO (no polling)
- **Embedded deployment** — Dashboard is built by Vite (client) + esbuild (server), bundled into CLI's `dist/dashboard/`, dynamically imported only when `ocr dashboard` runs

## Impact

- **Affected specs**: `cli` (new dashboard command, modified progress tracking), `session-management` (state.json → SQLite migration), new `dashboard` capability, new `sqlite-state` capability
- **Affected code**: `packages/dashboard/` (new package), `packages/cli/src/` (dashboard command, state commands, progress command), `packages/agents/` (agent reference files for state model migration)
- **Breaking changes**: `state.json` is deprecated as primary state medium (backward-compatible dual-write during migration). Agent reference files (`session-state.md`, `workflow.md`, `map-workflow.md`) must be updated to reflect SQLite-driven state model.
- **New dependencies**: sql.js (WASM SQLite), socket.io/socket.io-client, React 19, Vite 6, shadcn/ui, TanStack Query, react-markdown, Mermaid (lazy), @xterm/xterm (lazy), chokidar
