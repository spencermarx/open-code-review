## 1. SQLite Foundation (sqlite-state capability)

- [x] 1.1 Create `packages/cli/src/lib/db/` shared DB access module with sql.js initialization, connection management, and pragma application (WAL, foreign keys, busy timeout)
- [x] 1.2 Implement schema migration runner with `schema_version` table tracking and sequential SQL file execution
- [x] 1.3 Write initial migration (v1) with full DDL: `sessions`, `orchestration_events`, `review_rounds`, `reviewer_outputs`, `review_findings`, `markdown_artifacts`, `map_runs`, `map_sections`, `map_files`, `user_file_progress`, `user_finding_progress`, `user_notes`, `command_executions`, `schema_version`
- [x] 1.4 Implement auto-creation logic: create `.ocr/data/` directory and `ocr.db` on first access, run migrations
- [x] 1.5 Add typed query functions for `sessions` and `orchestration_events` tables (insert, update, select)
- [x] 1.6 Write tests for DB module: creation, migration, CRUD, WAL mode, concurrent access

## 2. OCR State Commands Migration (sqlite-state capability)

- [x] 2.1 Refactor `ocr state init` to write to SQLite (`sessions` + `orchestration_events`) with `state.json` dual-write
- [x] 2.2 Refactor `ocr state transition` to update SQLite and insert `phase_transition` event with `state.json` dual-write
- [x] 2.3 Refactor `ocr state close` to update SQLite and insert `session_closed` event with `state.json` dual-write
- [x] 2.4 Refactor `ocr state show` to read from SQLite (with `state.json` fallback)
- [x] 2.5 Refactor `ocr state sync` to trigger FilesystemSync logic (scan `.ocr/sessions/`, upsert artifacts, backfill sessions)
- [x] 2.6 Write tests for all `ocr state` commands: SQLite writes, event log, dual-write, fallback

## 3. Progress Command Migration (cli capability)

- [x] 3.1 Update `ocr progress` to read from SQLite `sessions` table as primary source
- [x] 3.2 Implement `state.json` fallback for legacy sessions without SQLite rows
- [x] 3.3 Write tests for progress command: SQLite read, fallback, waiting state

## 4. Dashboard Package Scaffold (dashboard capability)

- [x] 4.1 Create `packages/dashboard/` with `package.json` (`private: true`), `tsconfig.json`, project configuration
- [x] 4.2 Set up Vite config for client build (React, Tailwind CSS v4, shadcn/ui new-york)
- [x] 4.3 Set up esbuild config for server bundle (`dist/server.js`)
- [x] 4.4 Configure `nx.json` targets: `build:client`, `build:server`, `build`, `dev`
- [x] 4.5 Set up dev workflow: Vite on 5173 + tsx watch on 4173, proxy `/api/*` and `/socket.io/*`
- [x] 4.6 Install dependencies: React 19, React Router 7, TanStack Query 5, socket.io-client, react-markdown, remark-gfm, rehype-highlight, Lucide React, shadcn/ui primitives

## 5. Dashboard Server (dashboard capability)

- [x] 5.1 Create Express/Hono HTTP server with `http.createServer()` for Socket.IO attachment
- [x] 5.2 Integrate Socket.IO server with room-based scoping (`session:{id}`)
- [x] 5.3 Implement static file serving for production (client assets from `dist/client/`)
- [x] 5.4 Implement monorepo-aware `.ocr/` directory resolution (walk up from cwd)
- [x] 5.5 Implement SQLite connection using shared DB access module
- [x] 5.6 Implement REST API: sessions endpoints (`GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/events`)
- [x] 5.7 Implement REST API: reviews endpoints (`GET /api/sessions/:id/rounds`, rounds detail, findings, reviewer output)
- [x] 5.8 Implement REST API: maps endpoints (`GET /api/sessions/:id/runs`, run detail, sections, files, graph)
- [x] 5.9 Implement REST API: artifacts endpoint (`GET /api/sessions/:id/artifacts/:type`)
- [x] 5.10 Implement REST API: user progress mutations (`PATCH /api/map-files/:id/progress`, `PATCH /api/findings/:id/progress`, `DELETE .../progress`)
- [x] 5.11 Implement REST API: notes CRUD (`GET/POST/PATCH/DELETE /api/notes`)
- [x] 5.12 Implement REST API: commands (`GET /api/commands`, history, detail) and stats (`GET /api/stats`)
- [x] 5.13 Write server tests: API endpoints, Socket.IO events, error handling

## 6. FilesystemSync Service (dashboard capability)

- [x] 6.1 Implement full-scan logic: enumerate `.ocr/sessions/`, parse all artifacts into SQLite
- [x] 6.2 Implement map.md parser: section headings, file tables, roles, flow summaries → `map_sections` + `map_files`
- [x] 6.3 Implement reviewer output parser: finding headings, severity, file/line, summary → `review_findings`
- [x] 6.4 Implement final.md parser: verdict, blocker count, suggestion count → `review_rounds`
- [x] 6.5 Implement markdown artifact storage: raw content → `markdown_artifacts` table
- [x] 6.6 Implement chokidar watcher for incremental sync with mtime skip logic
- [x] 6.7 Implement Socket.IO event emission on artifact upsert (`artifact:created`, `artifact:updated`)
- [x] 6.8 Write tests for all parsers and sync logic: idempotency, upsert semantics, user table isolation

## 7. Real-Time Change Detection (dashboard capability)

- [x] 7.1 Implement WAL file watching (chokidar on `.ocr/data/ocr.db-wal`) for cross-process SQLite write detection
- [x] 7.2 Implement polling fallback: 500ms interval `SELECT MAX(id) FROM orchestration_events`
- [x] 7.3 Emit Socket.IO events (`session:created`, `session:updated`, `phase:changed`) on detected changes
- [x] 7.4 Write tests for change detection: WAL trigger, polling trigger, event emission

## 8. CLI Command Execution (dashboard capability)

- [x] 8.1 Implement `command:run` Socket.IO handler: spawn child process, whitelist validation
- [x] 8.2 Stream stdout/stderr via `command:output` events with ANSI passthrough
- [x] 8.3 Emit `command:started` and `command:finished` events, log to `command_executions` table
- [x] 8.4 Implement concurrent command guard (reject or queue second command)
- [x] 8.5 Write tests for command execution: spawn, stream, exit code, whitelist, concurrency guard

## 9. Dashboard Client — App Shell & Layout (dashboard capability)

- [x] 9.1 Set up React app shell: `App.tsx`, `router.tsx`, providers (Socket, Query, Theme)
- [x] 9.2 Create layout components: Sidebar (nav links, connection status), Header (theme toggle, breadcrumbs), content area
- [x] 9.3 Implement `SocketProvider` with auto-connect, room joining, reconnection
- [x] 9.4 Implement `ThemeProvider` with system/light/dark cycle and localStorage persistence
- [x] 9.5 Set up shared UI components: StatusBadge, PhaseTimeline, ProgressBar

## 10. Dashboard Client — Home & Sessions (dashboard capability)

- [x] 10.1 Implement Home page: stat cards (total/active sessions, reviews, maps, files, blockers), recent sessions list
- [x] 10.2 Implement Sessions list page: filterable by status and workflow type, sorted by updated_at desc
- [x] 10.3 Implement real-time session updates via Socket.IO event listeners + TanStack Query cache invalidation
- [x] 10.4 Implement Session Detail page: tabs (Review/Map), phase timeline, orchestration event log

## 11. Dashboard Client — Review Features (dashboard capability)

- [x] 11.1 Implement Review Round page: reviewer cards, findings data table, verdict banner
- [x] 11.2 Implement findings table: sortable, filterable by severity, triage status dropdown per finding
- [x] 11.3 Implement finding status persistence via `PATCH /api/findings/:id/progress`
- [x] 11.4 Implement Reviewer Detail page: full rendered markdown output
- [x] 11.5 Implement discourse rendering with AGREE/CHALLENGE/CONNECT/SURFACE visual differentiation

## 12. Dashboard Client — Map Features (dashboard capability)

- [x] 12.1 Implement Map Run page: section cards with progress bars, file checkboxes, global progress indicator
- [x] 12.2 Implement file review toggle via `PATCH /api/map-files/:id/progress`
- [x] 12.3 Implement "Clear Progress" with confirmation dialog
- [x] 12.4 Implement "View Raw Map" tab with rendered markdown

## 13. Dashboard Client — Dependency Graph (dashboard capability)

- [x] 13.1 Implement Mermaid lazy-loading via `React.lazy()`
- [x] 13.2 Implement section-level dependency graph from flow-analysis data
- [x] 13.3 Implement file-level drill-down on section node click
- [x] 13.4 Handle missing flow-analysis gracefully (hide graph section)

## 14. Dashboard Client — Markdown Rendering (dashboard capability)

- [x] 14.1 Create `MarkdownRenderer` component with react-markdown + remark-gfm + rehype-highlight
- [x] 14.2 Style code blocks, tables, headings, lists per shadcn design system, theme-aware syntax highlighting
- [x] 14.3 Create specialized components: `DiscourseBlock` (colored borders/icons), `VerdictBanner`

## 15. Dashboard Client — Command Center (dashboard capability)

- [x] 15.1 Implement command palette with available commands and confirmation for mutating commands
- [x] 15.2 Implement terminal output panel with @xterm/xterm (lazy-loaded) and ANSI color support
- [x] 15.3 Implement command history page from `command_executions` table
- [x] 15.4 Implement concurrent command guard UX (warning + wait/cancel options)

## 16. Dashboard Client — Notes (dashboard capability)

- [x] 16.1 Implement NotesPanel component (attachable to session, round, finding, run, section, file)
- [x] 16.2 Implement note CRUD via `/api/notes` endpoints

## 17. Build Pipeline Integration (dashboard capability)

- [x] 17.1 Configure `nx build dashboard` to produce `dist/server.js` + `dist/client/`
- [x] 17.2 Add CLI postbuild step: copy `packages/dashboard/dist/` → `packages/cli/dist/dashboard/`
- [x] 17.3 Configure CLI `package.json` `files` array to include `dist/dashboard/`
- [x] 17.4 Implement dynamic import in CLI: `await import('./dashboard/server.js')` only for `ocr dashboard` command
- [x] 17.5 Verify `nx build cli` depends on `nx build dashboard` via `dependsOn`
- [x] 17.6 Verify `nx release` excludes dashboard package (`private: true`)

## 18. Dashboard Command in CLI (cli capability)

- [x] 18.1 Register `ocr dashboard` command in Commander.js with `--port` and `--no-open` flags
- [x] 18.2 Implement OCR setup validation (`.ocr/` exists check)
- [x] 18.3 Implement browser auto-open via `open` package (respecting `--no-open`)
- [x] 18.4 Write tests for dashboard command: port option, no-open flag, setup validation, DB auto-creation

## 19. Accessibility & Cross-Browser (dashboard capability)

- [x] 19.1 Audit keyboard navigation for all interactive elements
- [x] 19.2 Ensure color is never the sole means of conveying status (add icons/text)
- [x] 19.3 Verify WCAG 2.1 AA contrast ratios in both light and dark themes
- [x] 19.4 Test in Chrome, Firefox, Safari, and Edge latest stable

## 20. Agent Reference Updates (session-management capability)

- [x] 20.1 Update `references/session-state.md`: replace `state.json` write instructions with `ocr state` CLI calls, document orchestration events
- [x] 20.2 Update `references/workflow.md`: replace `state.json` references with `ocr state transition` calls at all phase boundaries
- [x] 20.3 Update `references/map-workflow.md`: same migration as workflow.md for map phases
- [x] 20.4 Update `commands/review.md` and `commands/map.md`: use `ocr state show` for session state checks
