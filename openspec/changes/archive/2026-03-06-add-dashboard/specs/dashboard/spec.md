## ADDED Requirements

### Requirement: Session List

The dashboard SHALL display a list of all OCR sessions from SQLite, with real-time updates via Socket.IO.

#### Scenario: Sessions exist

- **GIVEN** one or more sessions exist in SQLite
- **WHEN** user opens the dashboard
- **THEN** sessions are listed sorted by `updated_at` descending
- **AND** each session shows: branch name, status badge (active/closed), current phase, workflow type (review/map), start date, elapsed time

#### Scenario: No sessions

- **GIVEN** no sessions exist in SQLite
- **WHEN** user opens the dashboard
- **THEN** an empty state is shown with instructions to run `/ocr-review` or `/ocr-map`
- **AND** a "Run Review" action button is available

#### Scenario: Filter by status

- **WHEN** user filters by "Active" or "Closed"
- **THEN** only sessions matching the filter are shown

#### Scenario: Filter by workflow type

- **WHEN** user filters by "Review" or "Map"
- **THEN** only sessions matching the workflow type are shown

#### Scenario: Real-time session appearance

- **GIVEN** the dashboard is open on the sessions list
- **WHEN** an AI agent creates a new session via `ocr state init`
- **THEN** the server emits a `session:created` Socket.IO event
- **AND** the new session appears in the list without page refresh

---

### Requirement: Session Detail

The dashboard SHALL display a detail view for a single session, with tabs for Review and Map sub-workflows and a live phase timeline.

#### Scenario: Session with review only

- **GIVEN** a session with `workflow_type = 'review'`
- **WHEN** user clicks the session
- **THEN** the review tab is shown with phase timeline and round navigation

#### Scenario: Session with map only

- **GIVEN** a session with `workflow_type = 'map'`
- **WHEN** user clicks the session
- **THEN** the map tab is shown with run navigation

#### Scenario: Session with both review and map

- **GIVEN** a session that has both review rounds and map runs
- **WHEN** user clicks the session
- **THEN** both Review and Map tabs are available
- **AND** the most recently active workflow tab is shown first

#### Scenario: Phase timeline with live updates

- **WHEN** viewing a session detail
- **THEN** a visual timeline shows all workflow phases with status indicators (pending, active, complete) and timestamps for completed phases
- **AND** when the server emits `phase:changed` for this session, the timeline updates in place without refresh

---

### Requirement: Review Round View

The dashboard SHALL display a detailed view of a single review round with rendered reviewer outputs, parsed findings, and triage controls.

#### Scenario: View round with completed reviews

- **GIVEN** a round with reviewer output files parsed into SQLite
- **WHEN** user navigates to the round
- **THEN** reviewer cards are shown, each displaying: reviewer type (principal/quality/security/testing), instance number, finding count

#### Scenario: View rendered reviewer output

- **WHEN** user clicks a reviewer card
- **THEN** the full reviewer markdown output is rendered using `react-markdown` with syntax highlighting
- **AND** code blocks, tables, and headings are styled consistently with the shadcn design system

#### Scenario: View findings table

- **WHEN** user opens the findings section
- **THEN** all parsed findings are shown in a sortable, filterable data table with columns: severity, title, file path, line range, blocker status, triage status
- **AND** findings are sorted by severity (critical to info) by default

#### Scenario: Finding status tracking

- **WHEN** user changes a finding's status (unread, read, acknowledged, fixed, wont_fix)
- **THEN** the status is persisted to SQLite (`user_finding_progress` table)
- **AND** the status is preserved across dashboard restarts

#### Scenario: View verdict

- **GIVEN** `final.md` content has been parsed into SQLite
- **WHEN** viewing the round
- **THEN** a verdict badge is shown: APPROVE (green), REQUEST CHANGES (red), or NEEDS DISCUSSION (yellow)
- **AND** blocker count, suggestion count, and should-fix count are displayed
- **AND** the full `final.md` content is rendered as rich markdown

#### Scenario: View discourse

- **GIVEN** `discourse.md` content has been parsed into SQLite
- **WHEN** user clicks "View Discourse"
- **THEN** the discourse content is rendered as rich markdown with AGREE/CHALLENGE/CONNECT/SURFACE sections visually differentiated

---

### Requirement: Code Review Map View

The dashboard SHALL display an interactive view of a Code Review Map run, replacing the static markdown experience.

#### Scenario: View map sections

- **GIVEN** a completed map run with data parsed into SQLite
- **WHEN** user navigates to the map run
- **THEN** sections are displayed as cards showing: section title, description, file count, progress bar (reviewed/total)
- **AND** sections are ordered by section number

#### Scenario: View files within section

- **WHEN** user expands a section card
- **THEN** all files in that section are listed with: file path, role description, lines added/deleted, review checkbox
- **AND** files are ordered by `display_order`

#### Scenario: Mark file as reviewed

- **WHEN** user checks a file's review checkbox
- **THEN** `user_file_progress` is updated (`is_reviewed = 1, reviewed_at = NOW()`)
- **AND** the section progress bar and global progress counter update
- **AND** the state persists across dashboard restarts

#### Scenario: Unmark file as reviewed

- **WHEN** user unchecks a file's review checkbox
- **THEN** `user_file_progress` is updated (`is_reviewed = 0, reviewed_at = NULL`)
- **AND** progress indicators update accordingly

#### Scenario: Clear all progress

- **WHEN** user clicks "Clear Progress" for a map run
- **THEN** a confirmation dialog appears
- **AND** upon confirmation, all `user_file_progress` rows for that run are reset

#### Scenario: Global progress indicator

- **WHEN** viewing a map run
- **THEN** a header shows "X / Y files reviewed" with a percentage progress bar
- **AND** this updates in real time as files are checked or unchecked

#### Scenario: View rendered map markdown

- **WHEN** user clicks "View Raw Map"
- **THEN** the full `map.md` content is rendered as rich markdown

---

### Requirement: Dependency Graph

The dashboard SHALL render Mermaid-based dependency diagrams showing relationships between map sections and files.

#### Scenario: Section-level graph

- **GIVEN** a map run with `flow-analysis.md` parsed into SQLite
- **WHEN** user views the map run
- **THEN** a section-level Mermaid graph is rendered showing dependencies between sections
- **AND** each node shows: section title, file count, review progress

#### Scenario: File-level drill-down

- **WHEN** user clicks a section node in the graph
- **THEN** the graph transitions to show file-level dependencies within that section
- **AND** a "Back to sections" control is available

#### Scenario: No flow analysis

- **GIVEN** a map run where `flow-analysis.md` does not exist or cannot be parsed
- **WHEN** user views the map run
- **THEN** the dependency graph section is hidden (not shown as an error)

#### Scenario: Graph rendering

- **WHEN** a dependency graph is displayed
- **THEN** Mermaid SHALL be lazy-loaded (not included in initial bundle)
- **AND** graphs render as SVG for crisp display at any zoom level

---

### Requirement: Real-Time Updates via Socket.IO

The dashboard SHALL reflect changes to session state in near-real-time via persistent WebSocket connections (Socket.IO). All data updates SHALL be push-based with no polling on the client.

#### Scenario: Agent updates state during review

- **GIVEN** the dashboard is open and showing a session
- **WHEN** an AI agent runs `ocr state transition`
- **THEN** the CLI writes to SQLite
- **AND** the dashboard server detects the write and emits a `phase:changed` event
- **AND** the client updates the phase timeline within 1 second

#### Scenario: New session appears

- **GIVEN** the dashboard is open on the sessions list
- **WHEN** an AI agent starts a new review via `ocr state init`
- **THEN** the new session appears in the list within 1 second without page refresh

#### Scenario: Filesystem artifact created

- **GIVEN** the dashboard is open and showing a review round
- **WHEN** a reviewer output file is written to the session directory
- **THEN** chokidar detects the file, FilesystemSync parses it into SQLite
- **AND** the reviewer card appears within 3 seconds

#### Scenario: Socket.IO connection lifecycle

- **WHEN** the React client connects to the dashboard server
- **THEN** a Socket.IO connection is established on the same port as HTTP
- **AND** the client subscribes to global events (`session:created`, `session:updated`)
- **AND** when viewing a specific session, the client joins a `session:{id}` room for scoped events
- **AND** if the connection drops, Socket.IO automatically reconnects with exponential backoff

---

### Requirement: Statistics Home Page

The dashboard SHALL display aggregate statistics on the home page.

#### Scenario: View stats

- **WHEN** user opens the dashboard home page
- **THEN** stat cards show: total sessions, active sessions, completed reviews, completed maps, total files tracked, unresolved blockers
- **AND** a list of the 10 most recent sessions is shown
- **AND** stats update in real-time via Socket.IO events

---

### Requirement: User Notes

The dashboard SHALL allow users to attach freeform notes to sessions, rounds, findings, map runs, sections, and files.

#### Scenario: Add note to finding

- **WHEN** user adds a note to a review finding
- **THEN** the note is saved to `user_notes` table with `target_type = 'finding'`
- **AND** the note is displayed alongside the finding

#### Scenario: Edit note

- **WHEN** user edits an existing note
- **THEN** `updated_at` is updated and content is replaced

#### Scenario: Delete note

- **WHEN** user deletes a note
- **THEN** the row is removed from `user_notes`

---

### Requirement: Theme Support

The dashboard SHALL support light, dark, and system-preference themes with an aesthetic consistent with shadcn/ui.

#### Scenario: System preference default

- **GIVEN** user has not set a theme preference
- **WHEN** the dashboard loads
- **THEN** the theme matches the OS preference (`prefers-color-scheme`)

#### Scenario: Toggle theme

- **WHEN** user clicks the theme toggle
- **THEN** the theme cycles through: system, light, dark, system
- **AND** the preference is saved to `localStorage` and persists across sessions

#### Scenario: Design language

- **WHEN** the dashboard renders any page
- **THEN** the visual language SHALL follow: clean hierarchical type scale, neutral-first palette with purposeful accent colors, generous whitespace on 4px grid, subtle card borders without heavy shadows, data-dense layouts optimized for scannability, and subtle purposeful transitions

---

### Requirement: CLI Command Execution

The dashboard SHALL allow users to execute OCR CLI commands from the browser, with real-time output streaming via Socket.IO.

#### Scenario: Run a CLI command

- **WHEN** user selects a command from the command palette or clicks an action button
- **THEN** the client emits a `command:run` Socket.IO event
- **AND** the server spawns the CLI process and streams stdout/stderr via `command:output` events
- **AND** the terminal output is rendered in a panel with monospace font and ANSI color support

#### Scenario: Command completes

- **WHEN** the spawned CLI process exits
- **THEN** the server emits a `command:finished` event with the exit code
- **AND** the output panel shows success (exit 0) or failure styling

#### Scenario: Available commands

- **WHEN** user opens the command palette
- **THEN** the following commands are available: `ocr init`, `ocr update`, `ocr state sync`, `ocr state show`
- **AND** commands that mutate state require a confirmation step

#### Scenario: Concurrent command guard

- **GIVEN** a command is already running
- **WHEN** user attempts to start another command
- **THEN** a warning is shown that a command is in progress
- **AND** the user may choose to wait or cancel the running command

---

### Requirement: Markdown Artifact Rendering

The dashboard SHALL render all markdown artifacts as rich, styled HTML using `react-markdown` with `rehype-highlight` and `remark-gfm`.

#### Scenario: Render reviewer output

- **WHEN** user views a reviewer's output
- **THEN** the raw markdown is rendered with syntax-highlighted code blocks matching the dashboard theme
- **AND** tables, headings, lists, and inline code are styled per the shadcn design system

#### Scenario: Render final review

- **WHEN** user views the final synthesis
- **THEN** the full `final.md` is rendered as rich markdown
- **AND** verdict badges and finding severity indicators are enhanced with dashboard-native components

#### Scenario: Render discourse

- **WHEN** user views the discourse
- **THEN** AGREE/CHALLENGE/CONNECT/SURFACE response types are visually distinguished with colored left borders and icons

#### Scenario: Render map and flow analysis

- **WHEN** user clicks "View Raw Map" or views the flow analysis
- **THEN** the full markdown is rendered with styled tables, code blocks, and file references

---

### Requirement: Filesystem Sync Service

The dashboard server SHALL run a FilesystemSync service that parses markdown artifacts from `.ocr/sessions/` into granular SQLite tables.

#### Scenario: Full scan on startup

- **GIVEN** the dashboard server starts
- **WHEN** initialization completes
- **THEN** FilesystemSync scans all sessions in `.ocr/sessions/` and upserts artifact data into SQLite

#### Scenario: Incremental sync on file change

- **GIVEN** the dashboard is running
- **WHEN** a new markdown artifact file is created or modified in `.ocr/sessions/`
- **THEN** chokidar detects the change and FilesystemSync parses the file into SQLite
- **AND** a Socket.IO event (`artifact:created` or `artifact:updated`) is emitted

#### Scenario: Upsert semantics

- **WHEN** FilesystemSync processes an artifact
- **THEN** it SHALL use `INSERT OR REPLACE` (upsert) for artifact tables
- **AND** it SHALL never delete existing rows
- **AND** it SHALL never touch user interaction tables (`user_file_progress`, `user_finding_progress`, `user_notes`)
- **AND** it SHALL never touch orchestration tables (`sessions`, `orchestration_events`)

#### Scenario: Skip unchanged files

- **WHEN** FilesystemSync encounters a file whose `mtime` has not changed since `parsed_at`
- **THEN** the file SHALL be skipped

#### Scenario: Idempotent full sync

- **WHEN** a full sync runs multiple times
- **THEN** the resulting SQLite state SHALL be identical each time

---

### Requirement: Zero Native Dependencies

The dashboard SHALL NOT require native compilation. All dependencies MUST be pure JavaScript or WASM.

#### Scenario: Clean install on any platform

- **GIVEN** a fresh macOS, Linux, or Windows environment with Node.js 20+
- **WHEN** user runs `npm install @open-code-review/cli`
- **THEN** installation completes without `node-gyp`, platform-specific prebuilds, or build tools

---

### Requirement: Embedded Deployment

The dashboard SHALL be fully self-contained within the CLI's npm package with no separate installation step.

#### Scenario: Dashboard served from CLI dist

- **GIVEN** user installs `@open-code-review/cli`
- **WHEN** user runs `ocr dashboard`
- **THEN** the server loads from `dist/dashboard/server.js` and serves the client from `dist/dashboard/client/`
- **AND** no additional package install or process startup is required

#### Scenario: Build pipeline integration

- **WHEN** `nx build cli` runs
- **THEN** it depends on `nx build dashboard` which produces `dist/server.js` + `dist/client/`
- **AND** the CLI postbuild step copies dashboard dist into `cli/dist/dashboard/`

---

### Requirement: Development Experience

The dashboard SHALL support a hot-reloading development workflow.

#### Scenario: Dev server startup

- **WHEN** developer runs `nx dev dashboard`
- **THEN** Vite dev server starts on port 5173 with HMR for the React client
- **AND** tsx watch starts the API + Socket.IO server on port 4173 with auto-restart
- **AND** Vite proxies `/api/*` and `/socket.io/*` to the API server

#### Scenario: Monorepo-aware OCR directory resolution

- **WHEN** the dev server starts from `packages/dashboard/`
- **THEN** it resolves `.ocr/` by walking up the directory tree to the monorepo root

---

### Requirement: Performance

The dashboard SHALL meet the following performance targets for typical usage (< 100 sessions, < 1000 files).

#### Scenario: Page load

- **WHEN** user opens the dashboard for the first time
- **THEN** initial load completes in under 2 seconds on localhost
- **AND** subsequent navigation is instant (SPA with client-side routing)
- **AND** Socket.IO connection is established within 500ms of page load

#### Scenario: API response time

- **WHEN** a REST API endpoint is called
- **THEN** it responds in under 100ms for typical session counts

#### Scenario: Real-time event propagation

- **WHEN** a write occurs in SQLite (via `ocr state`)
- **THEN** the corresponding client update completes within 1 second

#### Scenario: Bundle size

- **WHEN** the client JS bundle is built
- **THEN** it SHALL be under 500KB gzipped (excluding Mermaid and xterm, which are lazy-loaded)

---

### Requirement: Browser Support

The dashboard SHALL work in the latest stable versions of Chrome, Firefox, Safari, and Edge. No legacy browser support is required.

#### Scenario: Cross-browser compatibility

- **WHEN** user opens the dashboard in any supported browser
- **THEN** all features render and function correctly

---

### Requirement: Accessibility

The dashboard SHALL meet baseline accessibility standards.

#### Scenario: Keyboard navigation

- **WHEN** user navigates the dashboard using only the keyboard
- **THEN** all interactive elements are reachable and operable

#### Scenario: Color independence

- **WHEN** status information is conveyed by color
- **THEN** icons or text SHALL also be used alongside color

#### Scenario: Contrast ratios

- **WHEN** the dashboard renders in light or dark theme
- **THEN** sufficient contrast ratios per WCAG 2.1 AA are maintained

---

### Requirement: Extensibility

The dashboard architecture SHALL be designed for extensibility without architectural rework.

#### Scenario: Plugin-ready server

- **WHEN** a new feature module is added to the server
- **THEN** it registers routes and Socket.IO event handlers via a middleware/route registration pattern without modifying core server code

#### Scenario: Feature-sliced client

- **WHEN** a new feature is added to the React client
- **THEN** it adds a new directory under `features/` without requiring edits to existing feature directories

#### Scenario: Schema migrations

- **WHEN** a new feature requires database changes
- **THEN** it adds migration files without modifying existing migrations
- **AND** the `schema_version` table tracks applied versions
