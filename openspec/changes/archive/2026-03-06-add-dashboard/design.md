## Context

OCR needs a visual interface for navigating code reviews and maps. The current terminal-only experience (`ocr progress`) is ephemeral and non-interactive. The dashboard introduces a local web application backed by SQLite as the single source of truth, replacing `state.json` for all state management.

**Stakeholders**: OCR end users (software engineers), AI agents (write orchestration state), CLI (`ocr progress`, `ocr state`), dashboard (read/write UI state).

**Constraints**:
- Zero native dependencies (no `node-gyp`) — rules out `better-sqlite3`
- Embedded in CLI npm package — no separate install step
- Local-only — no auth, no cloud, no telemetry
- Must coexist with terminal UI (`ocr progress`)
- ESM only, TypeScript strict mode

## Goals / Non-Goals

**Goals**:
- Interactive session browsing, review inspection, and map navigation
- Real-time visibility into agent progress via Socket.IO
- Finding triage and file review progress tracking that persists across restarts
- Rich markdown rendering for all artifacts
- CLI command execution from the browser
- SQLite as single source of truth for CLI, agents, and dashboard
- Backward-compatible migration from `state.json`

**Non-Goals**:
- Authentication or multi-user access control
- Cloud sync or telemetry
- Full-text search across artifacts (defer to v2)
- GitHub PR export from dashboard (existing `ocr post` suffices for v1)
- IE11 or legacy browser support

## Decisions

### D-1: sql.js (WASM SQLite) over better-sqlite3

**Decision**: Use `sql.js` for all SQLite access.
**Alternatives**: `better-sqlite3` (native, faster), `libsql` (requires native builds on some platforms).
**Rationale**: Zero native deps is a hard constraint. `sql.js` is pure WASM, works on macOS/Linux/Windows without build tools. Performance is sufficient for the expected scale (< 100 sessions, < 1000 files).

### D-2: Socket.IO over SSE or polling

**Decision**: Use Socket.IO for all real-time communication.
**Alternatives**: Server-Sent Events (SSE, unidirectional), HTTP polling (simple but wasteful).
**Rationale**: Socket.IO provides bidirectional communication (required for command streaming), room-based scoping, automatic reconnection, and fallback transport. SSE cannot handle client→server events (command execution). Polling wastes resources and adds latency.

### D-3: Express or Hono + manual HTTP server for Socket.IO

**Decision**: Use Express (or Hono) with `http.createServer()` to share the port between HTTP and Socket.IO.
**Rationale**: Socket.IO attaches to a raw `http.Server`. Express has native integration. Hono works with manual HTTP server setup. Either framework is acceptable — both are pure JS.

### D-4: Vite (client) + esbuild (server) build pipeline

**Decision**: Vite builds the React client; esbuild bundles the server into a single `server.js`.
**Rationale**: Vite provides HMR for development and optimized production builds. esbuild produces a single server bundle that includes Socket.IO, avoiding runtime dependency resolution issues. Both integrate with the existing Nx monorepo.

### D-5: Embedded deployment via CLI postbuild copy

**Decision**: Dashboard build output is copied into CLI's `dist/dashboard/` during `nx build cli`. The CLI dynamically imports `dist/dashboard/server.js` only when `ocr dashboard` runs.
**Rationale**: Single `npm install` for end users. No separate process or Docker container. Dynamic import ensures dashboard dependencies don't affect CLI startup time for other commands.

### D-6: SQLite WAL file watching + polling fallback for cross-process change detection

**Decision**: Dashboard server detects external writes (from `ocr state` CLI) via chokidar watching `.ocr/data/ocr.db-wal` + short-interval polling of `orchestration_events` table as fallback.
**Alternatives**: IPC signal (more responsive but complex), pure polling (simpler but less responsive).
**Rationale**: WAL file watching is the simplest approach that provides sub-second detection. Polling fallback (500ms interval, single integer query) ensures reliability when WAL watching misses events.

### D-7: Feature-sliced React architecture

**Decision**: Client organized by feature (`features/sessions/`, `features/review/`, `features/map/`, `features/commands/`) with shared UI components.
**Rationale**: New features add directories without modifying existing ones (NFR-10 extensibility). Aligns with shadcn/ui patterns and TanStack Query per-feature query organization.

### D-8: Phased state.json → SQLite migration

**Decision**: Four-phase migration maintaining backward compatibility:
1. **Dual write** — `ocr state` writes to both SQLite and `state.json`
2. **Agent reference updates** — Update agent docs to reflect new model
3. **Deprecate state.json reads** — Remove fallback from `ocr progress`
4. **Remove state.json writes** — Stop writing `state.json` entirely

**Rationale**: Agents currently rely on `state.json`. A hard cutover would break in-flight reviews. Dual-write preserves backward compatibility while making SQLite authoritative immediately.

## Architecture

### Monorepo Structure

```
packages/
├── agents/        ← published @open-code-review/agents
├── dashboard/     ← internal only (private: true)
│   ├── src/
│   │   ├── server/    ← Express/Hono + Socket.IO + FilesystemSync
│   │   └── client/    ← React + shadcn/ui + socket.io-client
│   └── dist/
│       ├── server.js  ← esbuild bundle
│       └── client/    ← Vite build output
└── cli/           ← published @open-code-review/cli
    └── dist/
        ├── index.js
        └── dashboard/ ← copied from dashboard/dist/
```

### Data Flow

```
┌───────────────────────────────────────────────────────────────┐
│                  SQLite (.ocr/data/ocr.db)                    │
│              ★ Single source of truth ★                       │
└──────┬──────────────┬──────────────────┬──────────────────────┘
       │ writes        │ reads/writes      │ reads/writes
       ▼              ▼                  ▼
  AI Agents        CLI (ocr)         Dashboard Server
  (via ocr state   (progress,         (Express/Hono +
   CLI commands)    state, sync)       Socket.IO)
                                          │
                                 Socket.IO events
                                          │
                                          ▼
                                    React Client
                                 (socket.io-client)
```

### SQLite Schema (Three Layers)

**Layer 1 — Workflow State** (written by `ocr state` CLI):
- `sessions` — Core orchestration state (phase, round, status)
- `orchestration_events` — Append-only event log for timeline reconstruction

**Layer 2 — Artifacts** (written by FilesystemSync):
- `review_rounds`, `reviewer_outputs`, `review_findings` — Review data
- `markdown_artifacts` — Raw markdown for all artifact types
- `map_runs`, `map_sections`, `map_files` — Map data

**Layer 3 — User Interaction** (written by dashboard):
- `user_file_progress` — Map file review checkboxes
- `user_finding_progress` — Finding triage status
- `user_notes` — Freeform notes
- `command_executions` — CLI command audit log
- `schema_version` — Migration tracking

Full DDL is defined in `spec.md` §Data Model.

### Socket.IO Event Catalog

| Event | Direction | Trigger |
|-------|-----------|---------|
| `session:created` | server → client | New session in SQLite |
| `session:updated` | server → client | Session row updated |
| `session:closed` | server → client | Session status set to closed |
| `phase:changed` | server → client | Phase transition written to DB |
| `artifact:created` | server → client | FilesystemSync inserts artifact |
| `artifact:updated` | server → client | Artifact re-parsed |
| `command:started` | server → client | CLI command spawned |
| `command:output` | server → client | stdout/stderr chunk |
| `command:finished` | server → client | CLI command completed |
| `command:run` | client → server | User requests CLI execution |

### REST API

All endpoints under `/api/`. Key routes:
- `GET /api/sessions`, `GET /api/sessions/:id` — Session CRUD
- `GET /api/sessions/:id/rounds/:round` — Review round detail
- `GET /api/sessions/:id/runs/:run` — Map run detail
- `GET /api/sessions/:id/artifacts/:type` — Markdown artifact content
- `PATCH /api/map-files/:id/progress` — Toggle file review status
- `PATCH /api/findings/:id/progress` — Update finding triage status
- `GET /api/stats` — Aggregate statistics
- CRUD for `/api/notes`

Full endpoint inventory is in `spec.md` §API Endpoints.

### FilesystemSync

Bridges filesystem artifacts → SQLite artifact layer:
- **Startup**: Full scan of `.ocr/sessions/`
- **Runtime**: chokidar watches for file changes, incremental upsert
- **Manual**: `ocr state sync` CLI command
- **Rules**: Upsert only (never delete), skip unchanged (mtime vs parsed_at), never touch user/orchestration tables, idempotent, emits Socket.IO events

### Parsing Specifications

| Artifact | Parsing Target |
|----------|---------------|
| `map.md` | Section headings, file tables, roles, flow summaries → `map_sections` + `map_files` |
| `reviews/{type}-{n}.md` | Finding headings, severity, file/line, summary → `review_findings` |
| `final.md` | Verdict, blocker count, suggestion count → `review_rounds` |
| `flow-analysis.md` | Mermaid graph definitions (computed on-demand, not persisted) |

## Technology Stack

### Server
| Concern | Technology | Version |
|---------|-----------|---------|
| HTTP | Express or Hono | ^4.x / ^4.6 |
| Real-time | Socket.IO | ^4.8 |
| Database | sql.js | ^1.11 |
| File watching | chokidar | ^4 |
| Bundler | esbuild | ^0.24 |
| Dev runner | tsx | ^4.19 |

### Client
| Concern | Technology | Version |
|---------|-----------|---------|
| Framework | React | ^19 |
| Bundler | Vite | ^6 |
| UI | shadcn/ui (new-york) | — |
| Styling | Tailwind CSS | ^4 |
| Routing | React Router | ^7 |
| Data fetching | TanStack Query | ^5 |
| Real-time | socket.io-client | ^4.8 |
| Markdown | react-markdown + remark-gfm + rehype-highlight | ^9 / ^4 / ^7 |
| Diagrams | Mermaid (lazy) | ^11 |
| Icons | Lucide React | ^0.468 |
| Terminal | @xterm/xterm (lazy) | ^5 |

## Risks / Trade-offs

- **sql.js performance** — WASM SQLite is ~2-5x slower than native. Mitigated by small data volume (< 100 sessions) and indexed queries. Monitor for sessions with > 1000 files.
- **Bundle size** — Mermaid (~2MB) and xterm (~200KB) are large. Mitigated by lazy-loading both via `React.lazy()`.
- **Cross-process SQLite detection** — WAL file watching may miss rapid successive writes. Mitigated by polling fallback (500ms).
- **Agent migration** — Agents in-flight during migration may write to `state.json` only. Mitigated by dual-write in Phase 1 and `state.json` fallback in `ocr progress`.

## Migration Plan

### state.json → SQLite

1. **Phase 1 (Dual write)**: `ocr state` commands write to both SQLite and `state.json`. `ocr progress` reads SQLite with `state.json` fallback. Dashboard reads SQLite only.
2. **Phase 2 (Agent docs)**: Update `references/session-state.md`, `references/workflow.md`, `references/map-workflow.md`, `commands/review.md`, `commands/map.md` to document SQLite-driven state model.
3. **Phase 3 (Deprecate reads)**: Remove `state.json` fallback from `ocr progress`.
4. **Phase 4 (Remove writes)**: Stop writing `state.json`. Agents that haven't updated fail gracefully.

### Rollback

If SQLite migration causes issues:
- `ocr state` continues writing `state.json` (dual-write)
- `ocr progress` falls back to `state.json` reads
- Dashboard is the only consumer that requires SQLite — it degrades to empty state

## Open Questions

1. **Search** — Defer full-text search to v2. Filter-based navigation sufficient for v1.
2. **Export** — `ocr post` CLI handles GitHub. Can be triggered from dashboard command palette.
3. **Multi-user** — WAL mode supports concurrent access. Last write wins for user progress. Acceptable for local tool.
4. **xterm.js bundle** — Lazy-load via `React.lazy()`, consistent with Mermaid.
