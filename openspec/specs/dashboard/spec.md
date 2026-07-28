# dashboard Specification

## Purpose
The dashboard provides a browser-based interactive interface for exploring OCR review sessions, navigating Code Review Maps, triaging findings, managing AI-powered operations (reviews, maps, chat, post-to-GitHub, address feedback), and tracking command execution — all with real-time updates via Socket.IO.
## Requirements
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

The dashboard SHALL allow users to execute OCR CLI commands from the browser with real-time output streaming via Socket.IO, SHALL derive a command's reported outcome from the workflow's completeness rather than the process exit code alone, and SHALL mutate workflow lifecycle only by invoking the `ocr state` CLI (never by writing lifecycle tables directly). The dashboard read/sync path SHALL NOT originate terminal workflow completion: the presence of a `final.md` artifact on disk is evidence of the **synthesis** phase only, and terminal completion SHALL be recognized solely from the CLI-produced evidence (a `round_completed` event together with a validated `round-meta.json`).

#### Scenario: Run a CLI command

- **WHEN** user selects a command or clicks an action button
- **THEN** the client emits a `command:run` Socket.IO event
- **AND** the server spawns the CLI process and streams stdout/stderr via `command:output` events
- **AND** the terminal output is rendered with monospace font and ANSI color support

#### Scenario: Command completes with a derived outcome

- **WHEN** the spawned CLI process exits
- **THEN** the server emits a `command:finished` event carrying both the exit code and a derived `outcome`
- **AND** the `outcome` SHALL be computed from the `session_completeness` view for the linked workflow, not from `exit_code === 0` alone
- **AND** a process that exits 0 while its workflow is not genuinely complete SHALL report `incomplete`, not `success`

#### Scenario: Lifecycle mutation goes through the CLI-published commit primitive

- **WHEN** the dashboard's filesystem-sync reconciler needs to change workflow lifecycle (e.g. backfill-close a session it discovered on disk)
- **THEN** it SHALL mutate lifecycle only through the CLI-published `commitReasonClose` helper (a single transactional reason-event-then-status commit) — or, equivalently, a child-process `ocr state` invocation
- **AND** the dashboard SHALL NOT issue ad-hoc `INSERT INTO sessions`, `INSERT INTO orchestration_events`, or `UPDATE sessions SET status` outside that helper
- **AND** the dashboard SHALL write directly only to its owned tables (process-supervision journal and UX state)

#### Scenario: Final artifact alone does not constitute terminal completion

- **GIVEN** a session directory whose latest round contains a `final.md` but no validated `round-meta.json` and no `round_completed` event
- **WHEN** the dashboard's filesystem-sync reconciler processes it
- **THEN** it SHALL derive the `synthesis` phase, not `complete`
- **AND** it SHALL NOT backfill-close the session (SHALL NOT emit a `session_synced`-or-other reason-event close on the strength of `final.md` presence)
- **AND** the `session_completeness` view SHALL NOT report the session `complete`
- **AND** healing such a legacy round into a completed state SHALL be left to the CLI-side `ocr state reconcile` / migration path, which records its own reconciliation audit event

#### Scenario: Discovered session with a terminal artifact event backfill-closes normally

- **GIVEN** a session discovered on disk whose current round has a `round_completed` event and a validated `round-meta.json`
- **WHEN** the reconciler backfill-closes it
- **THEN** it SHALL close through the CLI-published `commitReasonClose` helper
- **AND** the close SHALL satisfy the completion invariant via the terminal artifact event

#### Scenario: Available commands

- **WHEN** user opens the command palette
- **THEN** at least `ocr init`, `ocr update`, `ocr state sync`, `ocr state status` are available
- **AND** commands that mutate state require a confirmation step

#### Scenario: Concurrent command guard

- **GIVEN** a command is already running
- **WHEN** user attempts to start another command
- **THEN** a warning is shown and the user may wait or cancel the running command

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
- **AND** it SHALL NOT delete existing rows
- **AND** it SHALL NOT touch user interaction tables (`user_file_progress`, `user_finding_progress`, `user_notes`)
- **AND** it SHALL NOT touch orchestration tables (`sessions`, `orchestration_events`)

#### Scenario: Skip unchanged files

- **WHEN** FilesystemSync encounters a file whose `mtime` has not changed since `parsed_at`
- **THEN** the file SHALL be skipped

#### Scenario: Idempotent full sync

- **WHEN** a full sync runs multiple times
- **THEN** the resulting SQLite state SHALL be identical each time

#### Scenario: Source latch for orchestrator data

- **GIVEN** a `round-meta.json` or `map-meta.json` has been processed by the CLI (source = 'orchestrator')
- **WHEN** FilesystemSync encounters the corresponding markdown artifact
- **THEN** it SHALL skip re-parsing structured data (findings, sections, files)
- **AND** it SHALL still store the raw markdown content in `markdown_artifacts` for display
- **AND** user progress (`user_file_progress`, `user_finding_progress`) SHALL be preserved

#### Scenario: Process round-meta.json

- **GIVEN** a `round-meta.json` file exists in a round directory
- **WHEN** FilesystemSync processes the session
- **THEN** it SHALL parse the JSON, validate `schema_version`, and populate `review_rounds`, `reviewer_outputs`, and `review_findings` tables
- **AND** existing user progress SHALL be stashed and restored after re-import
- **AND** `source` SHALL be set to `'orchestrator'`

#### Scenario: Process map-meta.json

- **GIVEN** a `map-meta.json` file exists in a map run directory
- **WHEN** FilesystemSync processes the session
- **THEN** it SHALL parse the JSON, validate `schema_version`, and populate `map_runs`, `map_sections`, and `map_files` tables
- **AND** existing user progress SHALL be stashed and restored after re-import
- **AND** `source` SHALL be set to `'orchestrator'`

#### Scenario: Structured files processed before markdown

- **GIVEN** both `round-meta.json` and `final.md` exist in a round directory
- **WHEN** FilesystemSync processes the round
- **THEN** `round-meta.json` SHALL be processed BEFORE `final.md`
- **AND** similarly, `map-meta.json` SHALL be processed BEFORE `map.md`

---

### Requirement: Zero Native Dependencies

The dashboard SHALL NOT require native compilation or a native-addon install
step. Its storage engine is the runtime's **built-in SQLite (`node:sqlite`)**,
and all other dependencies are pure JavaScript — so installation needs no
`node-gyp`, no platform-specific prebuilt binary, no install script, and no build
tools, on any platform. This requires **Node >= 22.5** (when `node:sqlite`
landed).

#### Scenario: Clean install on any platform

- **GIVEN** a fresh macOS, Linux, or Windows environment with Node.js >= 22.5
- **WHEN** the user installs `@open-code-review/cli` with any package manager (npm, pnpm including 10+, yarn)
- **THEN** installation completes without `node-gyp`, a platform-specific prebuild, an install script, or build tools

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

### Requirement: Post Review to GitHub

The dashboard SHALL allow posting a review round's final synthesis to GitHub as a PR comment from the round detail page, using the GitHub CLI (`gh`).

#### Scenario: Check GitHub auth and PR detection

- **GIVEN** the user clicks "Post to GitHub" on a review round page
- **WHEN** the client emits a `post:check-gh` Socket.IO event with the session ID
- **THEN** the server checks `gh auth status` and looks up the PR via `gh pr list --head <branch>`
- **AND** the server emits `post:gh-result` with `{ authenticated, prNumber, prUrl, branch }`

#### Scenario: Branch resolution for encoded names

- **GIVEN** the session branch is stored with hyphens (e.g. `feat-my-feature`)
- **WHEN** no PR is found for the literal branch name
- **THEN** the server SHALL try restoring common slash prefixes (e.g. `feat/my-feature`, `fix/my-feature`) and check each candidate
- **AND** the first matching PR is returned with the resolved branch name

#### Scenario: Post team review

- **GIVEN** GitHub auth is confirmed and a PR is detected
- **WHEN** the user chooses "Post Team Review"
- **THEN** the raw `final.md` content is submitted via `gh pr comment <prNumber> --body-file`
- **AND** a `post:submit-result` event is emitted with `{ success, commentUrl }`

#### Scenario: Successful post with comment URL

- **GIVEN** the review was posted successfully
- **WHEN** the `post:submit-result` event arrives with `success: true`
- **THEN** the dialog shows a success state with a clickable link to the GitHub comment

#### Scenario: GitHub CLI not authenticated

- **GIVEN** the user clicks "Post to GitHub"
- **WHEN** `gh auth status` fails
- **THEN** the dialog shows an error message instructing the user to run `gh auth login`

#### Scenario: No open PR found

- **GIVEN** GitHub auth succeeds
- **WHEN** no open PR matches the session branch (including slash-prefix candidates)
- **THEN** the dialog shows an error message indicating no PR was found for the branch

#### Scenario: Post submission failure

- **GIVEN** the user submits a review for posting
- **WHEN** `gh pr comment` fails
- **THEN** a `post:submit-result` event is emitted with `{ success: false, error }` and the dialog shows the error with a retry option

---

### Requirement: Human Review Translation

The dashboard SHALL allow users to generate a human-voice rewrite of the multi-reviewer synthesis using Claude CLI streaming, preview and edit the result, and save it as a draft before posting.

#### Scenario: Generate human review with streaming

- **GIVEN** GitHub auth is confirmed and a PR is detected
- **WHEN** the user chooses "Generate Human Review"
- **THEN** the server reads `final.md` and all reviewer output files for the round
- **AND** the server spawns Claude CLI with `--output-format stream-json --max-turns 1`
- **AND** text deltas are emitted as `post:token` events in real time
- **AND** the dialog displays the accumulating markdown content as it streams

#### Scenario: Tool status during generation

- **WHEN** Claude CLI uses tools (Read, Grep, Glob) during generation
- **THEN** the server emits `post:status` events with the tool name and a human-readable detail string
- **AND** the dialog displays the current tool activity in a status bar

#### Scenario: Preview and edit before posting

- **GIVEN** human review generation completes (server emits `post:done`)
- **WHEN** the dialog transitions to the preview step
- **THEN** the user can toggle between an edit view (textarea) and a rendered markdown preview
- **AND** the user can modify the generated content before posting

#### Scenario: Save draft as final-human.md

- **WHEN** the user clicks "Save Draft" in the preview step
- **THEN** the client emits a `post:save` event with the content
- **AND** the server writes the content to `final-human.md` in the session round directory
- **AND** FilesystemSync detects the file and stores it as a `final-human` artifact in SQLite

#### Scenario: Post human review

- **GIVEN** the user is in the preview step with generated or edited content
- **WHEN** the user clicks "Post to GitHub"
- **THEN** the content is submitted via `gh pr comment` the same as a team review post

#### Scenario: Cancel generation

- **WHEN** the user clicks "Cancel" during human review generation
- **THEN** the client emits a `post:cancel` event
- **AND** the server kills the Claude CLI process via SIGTERM
- **AND** the dialog returns to the ready step

#### Scenario: Generation error

- **WHEN** the Claude CLI process exits with a non-zero code
- **THEN** a `post:error` event is emitted with the error message
- **AND** the dialog transitions to an error step with a retry option

#### Scenario: Load existing human review draft

- **GIVEN** a `final-human.md` file exists for the round
- **WHEN** the user opens the round page
- **THEN** the `final-human` artifact is fetched and available for re-posting or editing

---

### Requirement: Human Review Prompt

The human review prompt SHALL produce a PR comment that reads as though a single human developer wrote it, following Google's code review guidelines for tone, with anti-AI writing instructions.

#### Scenario: Google code review tone

- **WHEN** the prompt is constructed
- **THEN** it SHALL instruct the model to comment on the code, never the developer
- **AND** it SHALL instruct the model to always explain why something matters
- **AND** it SHALL instruct the model to label severity naturally (e.g. prefix minor items with "Nit:" or "Minor:", flag blockers clearly)
- **AND** it SHALL instruct the model to acknowledge solid work briefly without over-praising

#### Scenario: Anti-AI writing instructions

- **WHEN** the prompt is constructed
- **THEN** it SHALL include instructions for sentence variety (mix short and long sentences, varied openers)
- **AND** it SHALL include a list of AI-typical words to avoid ("comprehensive", "robust", "leverage", "utilize", "furthermore", "additionally", "ensure", "facilitate")
- **AND** it SHALL instruct against the classic AI structure pattern (intro, numbered list, conclusion)
- **AND** it SHALL instruct the use of natural imperfections (dashes, parentheticals, contractions)

#### Scenario: Content preservation

- **WHEN** the prompt is constructed
- **THEN** it SHALL require preservation of every substantive technical finding from the source material
- **AND** it SHALL require inclusion of specific file paths and line numbers
- **AND** it SHALL require consolidation of duplicate findings from multiple reviewers
- **AND** it SHALL require stripping all meta-commentary about the review process

#### Scenario: Absolute prohibitions

- **WHEN** the prompt is constructed
- **THEN** it SHALL prohibit any mention of multiple reviewers, AI, agents, automated analysis, or tools
- **AND** it SHALL prohibit formulaic sign-offs or summary conclusion paragraphs
- **AND** the output format SHALL be GitHub-flavored markdown only, with no meta-preamble

---

### Requirement: Post Review State Machine

The dashboard client SHALL manage the post-to-GitHub flow through a deterministic state machine exposed as a React hook.

#### Scenario: State transitions

- **GIVEN** the hook is initialized
- **THEN** the state machine SHALL support the following steps: `idle`, `checking`, `ready`, `generating`, `preview`, `posting`, `posted`, `error`
- **AND** each step SHALL be a value of the `PostReviewStep` discriminated union type

#### Scenario: Reset to idle

- **WHEN** the user closes the dialog or clicks "Done"
- **THEN** the state machine resets to `idle` and clears all intermediate state (check result, streaming content, generated content, tool status, post result, error)

### Requirement: Round-Level Review Triage

The dashboard SHALL allow users to set a triage status on each review round, persisted to SQLite, for tracking review progress across sessions.

#### Scenario: Triage status values

- **GIVEN** a review round exists in the database
- **WHEN** a user sets triage status on the round
- **THEN** the status SHALL be one of: `needs_review`, `in_progress`, `changes_made`, `acknowledged`, `dismissed`
- **AND** the default status for rounds without explicit triage SHALL be `needs_review`

#### Scenario: Persist round triage

- **WHEN** user changes a round's triage status via the Reviews page dropdown
- **THEN** the client calls `PATCH /api/rounds/:id/progress` with `{ status }` body
- **AND** the server upserts a row in `user_round_progress` with the round ID and status
- **AND** the status persists across dashboard restarts

#### Scenario: Reset round triage

- **WHEN** user wants to clear triage status on a round
- **THEN** the client calls `DELETE /api/rounds/:id/progress`
- **AND** the `user_round_progress` row is deleted
- **AND** the round reverts to the default `needs_review` display

#### Scenario: Schema migration

- **GIVEN** the database is at schema version 2
- **WHEN** OCR upgrades to include round triage
- **THEN** migration v3 creates `user_round_progress` table with `UNIQUE(round_id)` and `ON DELETE CASCADE`

---

### Requirement: Reviews List Page

The dashboard SHALL display a filterable, sortable table of all review rounds across sessions, with an actionable-first default view.

#### Scenario: Default view shows actionable rounds

- **GIVEN** review rounds exist with various triage statuses
- **WHEN** user opens the Reviews page
- **THEN** only rounds with status `needs_review` or `in_progress` are shown by default
- **AND** an "Actionable" / "All" toggle controls the filter

#### Scenario: Filter by status

- **GIVEN** user has toggled to "All" view
- **WHEN** user selects a status from the Status dropdown
- **THEN** only rounds matching that status are shown

#### Scenario: Filter by verdict

- **WHEN** user selects a verdict from the Verdict dropdown
- **THEN** only rounds matching that verdict are shown
- **AND** verdict options are dynamically derived from loaded rounds

#### Scenario: Sortable columns

- **WHEN** user clicks a column header (Branch, Round, Verdict, Blockers, Status)
- **THEN** the table sorts by that column ascending
- **AND** clicking again reverses to descending

#### Scenario: Inline status change

- **WHEN** user changes a round's status via the inline dropdown
- **THEN** the status is updated via API without navigating away
- **AND** the dropdown click does not trigger row navigation

#### Scenario: Row navigation

- **WHEN** user clicks a table row (outside the status dropdown)
- **THEN** the user is navigated to `/sessions/:id/reviews/:round`

#### Scenario: Count display

- **WHEN** filters are applied
- **THEN** the table shows "N of M reviews" indicating filtered vs total count

---

### Requirement: Round Triage in Session Detail

The session detail Review tab SHALL display triage status badges next to each review round link.

#### Scenario: Round with triage status

- **GIVEN** a round has a `user_round_progress` row
- **WHEN** user views the session detail Review tab
- **THEN** a `StatusBadge` with the triage status is shown next to the round's verdict

#### Scenario: Round without triage status

- **GIVEN** a round has no `user_round_progress` row
- **WHEN** user views the session detail Review tab
- **THEN** no triage badge is shown (only the verdict text if present)

---

### Requirement: Round Detail Page Status Dropdown

The review round detail page SHALL include an inline triage status dropdown next to the round title, allowing users to update triage status without navigating back to the reviews table.

#### Scenario: Status dropdown display

- **GIVEN** the user is viewing a round detail page (`/sessions/:id/rounds/:round`)
- **WHEN** the page loads
- **THEN** a `<select>` dropdown SHALL appear next to the "Round N" title
- **AND** the dropdown SHALL show the current triage status (defaulting to `needs_review` if no status is set)
- **AND** the available options SHALL be: Needs Review, In Progress, Changes Made, Acknowledged, Dismissed

#### Scenario: Update status from round detail

- **GIVEN** the round detail page is displayed
- **WHEN** the user selects a new status from the dropdown
- **THEN** the client SHALL call `useUpdateRoundStatus()` mutation which sends `PATCH /api/rounds/:id/progress` with the new status
- **AND** the dropdown SHALL reflect the new status immediately (optimistic update via React Query)

#### Scenario: Consistency with reviews table

- **GIVEN** the user updates status on the round detail page
- **WHEN** the user navigates back to the reviews table
- **THEN** the reviews table SHALL show the updated status for that round

---

### Requirement: Enriched Review API Responses

All review-related API endpoints SHALL include the round's triage progress in responses.

#### Scenario: Reviews list endpoint

- **WHEN** client calls `GET /api/reviews`
- **THEN** each round in the response includes `progress: { id, round_id, status, updated_at } | null`

#### Scenario: Session rounds endpoint

- **WHEN** client calls `GET /api/sessions/:id/rounds`
- **THEN** each round includes the `progress` field

#### Scenario: Single round endpoint

- **WHEN** client calls `GET /api/sessions/:id/rounds/:round`
- **THEN** the response includes the `progress` field

---

### Requirement: Reusable SortableHeader Component

The dashboard SHALL provide a generic `SortableHeader` component for use across data tables.

#### Scenario: Generic sort control

- **GIVEN** a data table needs sortable columns
- **WHEN** the developer uses `SortableHeader<T>`
- **THEN** it renders a `<th>` with sort direction indicators and click handler
- **AND** it accepts a generic field type parameter for type-safe sort state

---

### Requirement: AI CLI Adapter Strategy

The dashboard server SHALL use a strategy pattern to detect, select, and interact with AI CLI tools (Claude Code, OpenCode) for spawning AI operations.

#### Scenario: Adapter detection on startup

- **GIVEN** the dashboard server is starting
- **WHEN** initialization completes
- **THEN** the server SHALL check for `claude` and `opencode` binaries in PATH
- **AND** the server SHALL select the first available binary as the active adapter
- **AND** the active adapter name SHALL be exposed via the `/api/config` endpoint

#### Scenario: Adapter unavailable

- **GIVEN** no AI CLI binary (`claude` or `opencode`) is found in PATH
- **WHEN** the server attempts to initialize the AI CLI adapter
- **THEN** `aiCli.active` SHALL be `null`
- **AND** all AI-dependent features (chat, translate, address) SHALL emit descriptive error events when invoked
- **AND** the error events SHALL indicate that no AI CLI was detected

#### Scenario: Adapter spawning

- **GIVEN** an active adapter has been detected
- **WHEN** the server needs to spawn an AI operation
- **THEN** the adapter SHALL spawn its CLI with `--output-format stream-json --max-turns N` flags
- **AND** the adapter SHALL return a `ChildProcess` handle and a `parseLine()` method
- **AND** `parseLine()` SHALL normalize raw CLI output into the standard event union

#### Scenario: Prompt delivery via stdin, never argv

- **GIVEN** an adapter spawns its CLI with a prompt (workflow, chat, or query mode)
- **WHEN** the child process is created
- **THEN** the prompt SHALL be delivered on the child's stdin — it SHALL NOT appear in any argv element
- **AND** the stdin stream SHALL have an error handler attached before writing, so a child that dies before draining (EPIPE) cannot crash the dashboard process
- **AND** an empty prompt SHALL be rejected before spawning
- **AND** each adapter's spawn shape (argv plus stdin delivery) SHALL be pinned by unit tests, including the negative invariant that no argv element contains the prompt

#### Scenario: Normalized event stream

- **GIVEN** an adapter has spawned a CLI process
- **WHEN** the CLI emits raw output lines
- **THEN** the adapter's `parseLine()` SHALL parse each line into one of the normalized event types: `text`, `thinking`, `tool_start`, `tool_end`, `full_text`, `session_id`, `error`
- **AND** unrecognized lines SHALL be silently discarded

#### Scenario: Client capability detection

- **GIVEN** the dashboard client is loading
- **WHEN** the client fetches `GET /api/config`
- **THEN** the response SHALL include `aiCli.active` indicating the detected adapter name or `null`
- **AND** the client SHALL render capability-aware UI based on this value (e.g., AddressFeedbackPopover shows run mode when active, copy mode when null)

### Requirement: Unified Execution Tracking

The dashboard SHALL track all AI operations (CLI commands, chat, post-to-GitHub, translate-to-human) in a single `command_executions` table, with real-time lifecycle events via Socket.IO.

#### Scenario: Execution lifecycle events

- **GIVEN** an AI operation is initiated
- **WHEN** the server begins executing the operation
- **THEN** a row SHALL be inserted via `startTrackedExecution()` with operation type, args, and start timestamp
- **AND** the server SHALL emit a `command:started` Socket.IO event with the execution ID
- **AND** output SHALL be streamed as `command:output` events
- **AND** upon completion, the server SHALL emit `command:finished` with exit code and end timestamp

#### Scenario: Active commands tab

- **GIVEN** one or more AI operations are currently executing
- **WHEN** the user opens the Commands page
- **THEN** all in-progress executions SHALL appear in the "Active" tab bar
- **AND** each active entry SHALL show: operation type, elapsed time, and a live output stream

#### Scenario: Command history

- **GIVEN** AI operations have completed
- **WHEN** the user views the Commands page history
- **THEN** completed executions SHALL be listed with: command name, arguments, start timestamp, end timestamp, and exit code
- **AND** history SHALL be sorted by start timestamp descending

#### Scenario: Tracked operation types

- **WHEN** any of the following operations execute
- **THEN** they SHALL be tracked in the `command_executions` table: `ocr review`, `ocr map`, `ocr chat (map)`, `ocr chat (review)`, `ocr translate-review-to-single-human`, `ocr post-to-github`, `ocr address`

---

### Requirement: Ask the Team Chat

The dashboard SHALL provide an "Ask the Team" chat feature that allows users to have AI-assisted conversations about specific review rounds or map runs, with session persistence.

#### Scenario: Chat initiation

- **GIVEN** the user is viewing a review round or map run page
- **WHEN** the user clicks "Ask the Team"
- **THEN** a chat panel SHALL open scoped to that specific round or map run
- **AND** the panel SHALL display any existing conversation history for that target

#### Scenario: Context injection

- **GIVEN** a new conversation is started for a round or map run
- **WHEN** the first user message is sent
- **THEN** the server SHALL build context by reading the relevant review or map artifacts
- **AND** the context SHALL be injected as a system-level preamble so the AI understands the subject matter

#### Scenario: Session resumption

- **GIVEN** a conversation already exists for a round or map run
- **WHEN** the user sends a subsequent message
- **THEN** the server SHALL resume the Claude session via `resumeSessionId`
- **AND** the AI SHALL maintain full conversational continuity from prior messages

#### Scenario: Real-time streaming

- **GIVEN** the AI is generating a response
- **WHEN** tokens are produced
- **THEN** they SHALL be emitted as `chat:token` Socket.IO events
- **AND** thinking and tool usage SHALL be emitted as `chat:status` events
- **AND** the client SHALL render tokens incrementally as they arrive

#### Scenario: Message persistence

- **GIVEN** a user sends a message or the AI responds
- **WHEN** the message is complete
- **THEN** it SHALL be saved to the `chat_messages` table with role, content, and timestamp
- **AND** the full conversation SHALL be loadable via a `chat:history` request

#### Scenario: Conversation lifecycle

- **GIVEN** a conversation exists
- **WHEN** 48 hours pass without any new messages
- **THEN** the conversation SHALL be marked as expired
- **AND** on server shutdown, all active chat processes SHALL be cleaned up via SIGTERM

#### Scenario: Allowed tools

- **GIVEN** the AI is processing a chat message
- **WHEN** the AI attempts to use tools
- **THEN** only read-only tools SHALL be permitted: `Read`, `Grep`, `Glob`
- **AND** any tool not in the allowed list MUST be rejected

---

### Requirement: Address Feedback Popover

The dashboard SHALL provide a capability-aware "Address Feedback" action on review round pages that supports both in-dashboard execution and clipboard-based terminal workflows.

#### Scenario: Button visibility

- **GIVEN** a review round page is displayed
- **WHEN** `final.md` exists for the round
- **THEN** the "Address Feedback" button SHALL be visible
- **AND** when `final.md` does not exist, the button SHALL be hidden

#### Scenario: AI CLI available (run mode) — dual actions

- **GIVEN** `aiCli.active` is truthy (an AI CLI adapter is detected)
- **WHEN** the user clicks "Address Feedback"
- **THEN** the popover SHALL display TWO action buttons side by side:
  1. **"Run in Dashboard"** — spawns the command via Socket.IO `command:run` and navigates to `/commands` (existing behavior, with two-step confirmation flow)
  2. **"Copy to Terminal"** — copies the `/ocr:address <path>` slash command (with optional notes) to the clipboard
- **AND** the command preview SHALL show the slash command format (e.g., `/ocr:address .ocr/sessions/.../final.md`)
- **AND** the "Copy to Terminal" button SHALL show a "Copied!" confirmation that auto-dismisses after 2 seconds

#### Scenario: Copy to Terminal with notes

- **GIVEN** the user has entered text in the notes textarea
- **WHEN** the user clicks "Copy to Terminal"
- **THEN** the copied text SHALL include the slash command path followed by `NOTES:` and the trimmed notes text on a new line

#### Scenario: AI CLI unavailable (copy mode)

- **GIVEN** `aiCli.active` is falsy (no AI CLI adapter is detected)
- **WHEN** the user clicks "Address Feedback"
- **THEN** a popover SHALL appear showing: the review path, an "Include AI prompt" checkbox (default: checked), and a copy-to-clipboard button
- **AND** the copy action SHALL copy the review path and, when checked, a portable prompt for use in an external AI tool

#### Scenario: Command execution

- **GIVEN** the popover is in run mode and the user has entered optional notes
- **WHEN** the user clicks "Run in Dashboard" and then "Confirm"
- **THEN** the client SHALL emit a `command:run` Socket.IO event with the built command string
- **AND** the client SHALL navigate to `/commands` to show the execution output

---

### Requirement: Enhanced Command Center

The dashboard Command Center SHALL support running AI-powered OCR commands (review, map) with a command palette, confirmation flow, and concurrent execution tracking.

#### Scenario: Command palette commands

- **WHEN** the user opens the command palette
- **THEN** two launchable AI commands SHALL be available: `ocr review` (listed first) and `ocr map` (listed second)
- **AND** each command SHALL have configurable parameters: Target (file/directory path), Requirements (freeform text), and Fresh Start (boolean toggle)

#### Scenario: Server-accepted AI commands

- **GIVEN** the server receives a `command:run` Socket.IO event
- **WHEN** the command matches one of the accepted types
- **THEN** the server SHALL accept and execute: `map`, `review`, `translate-review-to-single-human`, `address`
- **AND** unrecognized command types SHALL be rejected with an error event

#### Scenario: Confirmation flow

- **GIVEN** the user has configured command parameters in the palette
- **WHEN** the user clicks "Run"
- **THEN** a confirmation overlay SHALL appear showing: the full command string, a security notice about AI execution, and Start/Cancel buttons
- **AND** execution SHALL only begin when the user clicks "Start"

#### Scenario: Re-run from history

- **GIVEN** completed commands appear in the command history
- **WHEN** the user clicks the re-run action on a history entry
- **THEN** the command palette SHALL open with parameters prefilled from the parsed historical command
- **AND** the user SHALL be able to modify parameters before running

---

### Requirement: Database Sync Watcher

The dashboard server SHALL poll the SQLite database for external changes (writes from CLI/agents) and emit Socket.IO events when data changes.

#### Scenario: Polling interval

- **GIVEN** the dashboard server is running
- **WHEN** the Database Sync Watcher is active
- **THEN** it SHALL poll at a configurable interval (default: 2 seconds) by checking the file mtime of `ocr.db`

#### Scenario: Change detection

- **GIVEN** the watcher detects that `ocr.db` mtime has changed since the last poll
- **WHEN** the watcher processes the change
- **THEN** it SHALL reload relevant data from the database
- **AND** it SHALL emit scoped Socket.IO events for any data that has changed (e.g., `session:updated`, `phase:changed`)

#### Scenario: Coexistence with FilesystemSync

- **GIVEN** both Database Sync Watcher and FilesystemSync are active
- **WHEN** external changes occur
- **THEN** Database Sync Watcher SHALL handle SQLite-originated changes (from `ocr state` CLI commands)
- **AND** FilesystemSync SHALL handle filesystem-originated changes (markdown artifacts in `.ocr/sessions/`)
- **AND** the two watchers SHALL NOT conflict or duplicate event emissions for the same logical change

### Requirement: DbSyncWatcher Completion Event Processing

The dashboard's `DbSyncWatcher` SHALL process `round_completed` and `map_completed` orchestration events from the CLI's SQLite database to populate artifact tables in real time.

#### Scenario: Round completed event

- **GIVEN** the dashboard is running and watching the CLI's database
- **WHEN** a `round_completed` event is detected in `orchestration_events`
- **THEN** the `DbSyncWatcher` SHALL:
  - Parse the event's metadata JSON
  - Check the source latch on the corresponding `review_rounds` row (skip if already `'orchestrator'`)
  - Insert or update the `review_rounds` row with derived counts and `source = 'orchestrator'`
  - Emit a `review:updated` Socket.IO event

#### Scenario: Map completed event

- **GIVEN** the dashboard is running and watching the CLI's database
- **WHEN** a `map_completed` event is detected in `orchestration_events`
- **THEN** the `DbSyncWatcher` SHALL:
  - Parse the event's metadata JSON
  - Check the source latch on the corresponding `map_runs` row (skip if already `'orchestrator'`)
  - Insert or update the `map_runs` row with derived counts and `source = 'orchestrator'`
  - Emit a `map:updated` Socket.IO event

#### Scenario: Idempotent event processing

- **GIVEN** the same completion event is processed multiple times
- **WHEN** the source latch shows `'orchestrator'` already set
- **THEN** the event SHALL be skipped without error

### Requirement: Session Liveness Header

The dashboard SHALL display a liveness header on the session detail page (`/sessions/:id`) that classifies the session as Running, Stalled, or Orphaned based on the freshness of its child `agent_sessions` heartbeats.

#### Scenario: Running session

- **GIVEN** a workflow has at least one `agent_sessions` row in `status = 'running'` with `last_heartbeat_at` within the threshold
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Running" with a fresh activity timestamp

#### Scenario: Stalled session pending sweep

- **GIVEN** a workflow has a `running` agent session with a stale heartbeat that has not yet been swept
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Stalled" with the elapsed time since last activity
- **AND** SHALL surface "Continue here" and "Mark abandoned" affordances

#### Scenario: Orphaned session post sweep

- **GIVEN** a workflow has a stale agent session that has been reclassified to `orphaned`
- **WHEN** the user opens the session detail page
- **THEN** the liveness header SHALL display "Orphaned" with the elapsed time since last activity
- **AND** SHALL surface "View final state" and "Start new review on this branch" affordances

#### Scenario: Real-time push of liveness changes

- **GIVEN** the dashboard is open on a session
- **WHEN** an `agent_sessions` row transitions status (e.g. running → orphaned)
- **THEN** the server SHALL emit an `agent_session:updated` Socket.IO event (debounced 200ms)
- **AND** the liveness header SHALL update without a page refresh

---

### Requirement: In-Dashboard "Continue Here" Resume

The dashboard SHALL provide a one-click "Continue here" affordance on the session detail page for stalled, orphaned, or completed-but-resumable workflows, that re-spawns the host AI CLI via OCR's resume primitive. The affordance and the automatic watchdog (`DbSyncWatcher Auto-Forward-Resume of Stranded Sessions`) SHALL share the **same** resume primitive and the same fixed CONTROL prompt, and for a stranded mid-pipeline run the resume SHALL be **forward-only** — continuing from `current_phase` rather than regressing it.

#### Scenario: Continue resumes via captured vendor session id

- **GIVEN** a workflow has at least one `agent_sessions` row with `vendor_session_id` populated
- **WHEN** the user clicks "Continue here"
- **THEN** the server SHALL invoke `ocr review --resume <workflow-session-id>` via the existing socket command runner
- **AND** the host CLI SHALL be spawned with its vendor-native resume flag and the captured `vendor_session_id`
- **AND** the vendor session id SHALL NOT be displayed in the UI

#### Scenario: Continue is unavailable when no resume adapter exists

- **GIVEN** a workflow on a host with no per-vendor resume adapter
- **WHEN** the user views the session detail page
- **THEN** the "Continue here" affordance SHALL be disabled with a tooltip explaining that auto-spawn is unavailable for this host
- **AND** the user SHALL be directed to "Pick up in terminal" (re-invoking the review skill), which forward-resumes with no adapter

#### Scenario: Continue forward-resumes a stranded mid-pipeline run

- **GIVEN** a stranded mid-pipeline workflow whose `current_phase` is `reviews` on a host with a resume adapter
- **WHEN** the user clicks "Continue here"
- **THEN** the resume SHALL acquire the lease and continue forward from `reviews` via the shared resume primitive
- **AND** it SHALL NOT regress `current_phase`

### Requirement: "Pick Up in Terminal" Handoff Panel

The dashboard SHALL provide a "Pick up in terminal" panel that surfaces copyable shell commands for resuming a session in the user's local terminal. The panel SHALL render structured outcomes — never fabricate a command from incomplete data, never erase failure information into a single boolean signal.

#### Scenario: Vendor-native command shown by default when session id is captured

- **GIVEN** a workflow with a captured `vendor_session_id`
- **WHEN** the user opens the handoff panel
- **THEN** the panel SHALL show two copyable commands:
  1. `cd <project-dir>`
  2. The vendor's native resume invocation (e.g. `claude --resume <vendor-session-id>` or `opencode run "" --session <vendor-session-id> --continue`)
- **AND** the vendor-native command SHALL be the primary copy (not gated behind a toggle)

#### Scenario: OCR-mediated command available only when CLI publishes the subcommand

- **GIVEN** the published `ocr` CLI carries a `review --resume <workflow-id>` subcommand
- **WHEN** the user opens the handoff panel for a workflow with a captured `vendor_session_id`
- **THEN** the panel SHALL offer a mode toggle between vendor-native and OCR-mediated
- **AND** the OCR-mediated command SHALL be `cd <project-dir> && ocr review --resume <workflow-id>`

#### Scenario: OCR-mediated command is NOT shown when the CLI lacks the subcommand

- **GIVEN** the dashboard knows the published CLI does not carry `review --resume` (gated server-side)
- **WHEN** the user opens the handoff panel
- **THEN** only the vendor-native path SHALL be offered
- **AND** the panel SHALL NOT render a copy button for an OCR-mediated command

#### Scenario: Project directory and vendor are surfaced for context

- **GIVEN** the handoff panel is open for a workflow with a captured `vendor_session_id`
- **WHEN** the user views the panel header
- **THEN** the panel SHALL display the AI CLI used (e.g. "Claude Code") and the project directory (e.g. `~/work/my-app`)

#### Scenario: PATH detection for the host CLI

- **GIVEN** the dashboard server can probe the local environment for the host CLI binary
- **WHEN** the panel is opened
- **THEN** the server SHALL report whether the host CLI binary is on PATH
- **AND** when the binary is not on PATH, the panel SHALL display an inline note suggesting the user install it before pasting the command

#### Scenario: Server-built command strings

- **GIVEN** the panel is rendering its commands
- **WHEN** the client requests the handoff payload
- **THEN** the dashboard server SHALL return fully-built command strings via `GET /api/sessions/:id/handoff`
- **AND** the client SHALL NOT reconstruct command strings locally

#### Scenario: Multiple entry points

- **GIVEN** a session is selectable from multiple places in the dashboard
- **WHEN** the user invokes "Pick up in terminal" from any of: the session detail page, the round detail page, or the command-history expanded row
- **THEN** the same handoff panel SHALL open scoped to that workflow

#### Scenario: Edge case — workflow not found

- **GIVEN** a workflow id that does not match any row
- **WHEN** the panel requests the handoff payload
- **THEN** the panel SHALL render a structured failure with `reason: 'workflow-not-found'` (see "Self-Diagnosing Handoff Failure" requirement)
- **AND** the panel SHALL NOT fabricate a command

#### Scenario: Edge case — no vendor session id captured

- **GIVEN** a workflow whose AI invocations completed but no `session_id` event was ever observed AND the events JSONL contains no `session_id` event for any of the workflow's invocations
- **WHEN** the user opens the handoff panel
- **THEN** the panel SHALL render a structured failure with `reason: 'no-session-id-captured'` (see "Self-Diagnosing Handoff Failure" requirement)
- **AND** the panel SHALL NOT fabricate a "fresh start" command

### Requirement: Team Composition Panel

The dashboard SHALL provide a Team Composition Panel in the New Review flow
that lets the user compose a per-run team — count, persona selection, and
per-instance models — without editing YAML. Model dropdowns across all
dashboard surfaces (team composition panel, reviewer dialog, default team
section) SHALL be populated from `GET /api/team/models`, which is backed by
the shared CLI model-discovery library — adapters SHALL NOT carry their own
model-enumeration logic.

#### Scenario: Panel reads the resolved team

- **GIVEN** the user opens "New Review" from the Command Center
- **WHEN** the Team Composition Panel mounts
- **THEN** it SHALL request `GET /api/team/resolved` and populate persona rows
  from the result
- **AND** it SHALL request `GET /api/team/models?vendor=<activeCli>` to
  populate model dropdowns

#### Scenario: Same-model and per-reviewer modes per persona row

- **GIVEN** a persona row with count > 1
- **WHEN** the user toggles between "Same model" and "Per reviewer" mode
- **THEN** in "Same model" mode, one model dropdown SHALL apply to all
  instances of that persona
- **AND** in "Per reviewer" mode, each instance row SHALL display its own
  model dropdown

#### Scenario: Adding and removing reviewers

- **GIVEN** the panel is open
- **WHEN** the user adds a reviewer not currently in the team
- **THEN** a new row SHALL appear with count 1 and `(default)` model selected
- **AND** the user SHALL be able to remove rows by setting count to 0 or via
  an explicit remove control

#### Scenario: Save as default checkbox is opt-in

- **GIVEN** the user has customized the team for this run
- **WHEN** the user clicks Run with the "Save as default for this workspace"
  checkbox unchecked
- **THEN** the override SHALL be passed to `ocr review` as a session-only
  `--team` argument
- **AND** `.ocr/config.yaml` SHALL NOT be modified

#### Scenario: Save as default persists to config

- **GIVEN** the user has customized the team for this run
- **WHEN** the user clicks Run with the "Save as default for this workspace"
  checkbox checked
- **THEN** the dashboard SHALL invoke `ocr team set --stdin` with the new team
- **AND** SHALL then invoke `ocr review` without a session override

#### Scenario: Free-text model entry is always available

- **GIVEN** the model dropdown is populated (natively or from the bundled
  fallback)
- **WHEN** the user opens a model picker
- **THEN** the picker SHALL offer a "Custom…" entry that accepts free-text
  model id input
- **AND** when the model list is empty, the picker SHALL degrade entirely to
  a free-text input
- **AND** any model id accepted by the underlying CLI SHALL be valid input

#### Scenario: Bundled fallback source is disclosed

- **GIVEN** `GET /api/team/models` reports `source: "bundled"`
- **WHEN** a model-picker surface renders
- **THEN** the surface SHALL display a hint that the list is a bundled
  fallback (with the reported `nativeUnavailableReason`), not the vendor's
  live model inventory

#### Scenario: Unknown saved model ids render as custom options

- **GIVEN** a saved team references a model id not present in the current
  model list
- **WHEN** a model picker renders with that value
- **THEN** the picker SHALL render the saved id as a selectable "(custom)"
  option — it SHALL NOT render blank or fall back to the `(default)` label
- **AND** the saved id SHALL be passed through to the vendor CLI unchanged

#### Scenario: Host without per-task model support disables per-reviewer mode

- **GIVEN** the active adapter reports `supportsPerTaskModel = false`
- **WHEN** the panel is rendered
- **THEN** the "Per reviewer" mode toggle SHALL be disabled with an
  explanatory tooltip
- **AND** all reviewers in a run SHALL be expected to share the same parent
  model

### Requirement: Reviewers Page "In Default Team" Badge

The reviewers page SHALL display, on each reviewer card, a small badge indicating whether and at what count the reviewer is in `default_team`.

#### Scenario: Badge displayed for in-team reviewers

- **GIVEN** the resolved team contains two `principal` instances
- **WHEN** the user opens the reviewers page
- **THEN** the `principal` reviewer card SHALL show a badge such as "In default team ×2"

#### Scenario: Badge absent for out-of-team reviewers

- **GIVEN** a reviewer is not present in `default_team`
- **WHEN** the user opens the reviewers page
- **THEN** that reviewer's card SHALL NOT show the badge

#### Scenario: Badge click opens team panel preset to the persona

- **GIVEN** a reviewer card displays the in-team badge
- **WHEN** the user clicks the badge
- **THEN** the Team Composition Panel SHALL open with that persona's row pre-focused

---

### Requirement: New Server Routes

The dashboard server SHALL expose new HTTP routes that back the team panel,
agent-session liveness, "Continue here", and "Pick up in terminal" features.

#### Scenario: Team resolution endpoint

- **GIVEN** the dashboard team panel is loading
- **WHEN** the client calls `GET /api/team/resolved`
- **THEN** the server SHALL invoke `ocr team resolve --json` and return the
  resulting `ReviewerInstance[]`

#### Scenario: Team default persistence endpoint

- **GIVEN** the user has chosen "Save as default" with a customized team
- **WHEN** the client calls `POST /api/team/default` with
  `{ team: ReviewerInstance[] }`
- **THEN** the server SHALL invoke `ocr team set --stdin` with the supplied
  team and return success or a validation error

#### Scenario: Model listing endpoint

- **GIVEN** a dashboard surface needs the model list for a vendor
- **WHEN** the client calls `GET /api/team/models?vendor=<vendor>`
- **THEN** the server SHALL return the CLI model-discovery library's envelope
  `{ vendor, source, models, nativeUnavailableReason? }` without blocking the
  event loop on synchronous process spawns
- **AND** vendor validation SHALL derive from the strategy table's supported
  vendors (unknown vendors → 400)
- **AND** `vendor=auto` (or omitted) SHALL resolve via detection and return
  `{ vendor: null, source: null, models: [] }` when no vendor is installed

#### Scenario: Agent-session listing endpoint

- **GIVEN** the dashboard liveness header is loading for a session
- **WHEN** the client calls `GET /api/agent-sessions?workflow=<id>`
- **THEN** the server SHALL return the agent-session rows for that workflow

#### Scenario: In-dashboard continue endpoint

- **GIVEN** the user clicks "Continue here"
- **WHEN** the client calls `POST /api/sessions/:id/continue`
- **THEN** the server SHALL invoke `ocr review --resume <id>` via the existing
  command runner and emit live progress over Socket.IO

#### Scenario: Terminal handoff endpoint

- **GIVEN** the user opens the handoff panel for a session
- **WHEN** the client calls `GET /api/sessions/:id/handoff`
- **THEN** the server SHALL return a payload `{ vendor, vendorSessionId,
  projectDir, hostBinaryAvailable, ocrCommand, vendorCommand }`
- **AND** the two command strings SHALL be fully built server-side

### Requirement: Self-Diagnosing Handoff Failure

When the handoff cannot produce a resumable command pair, the panel SHALL render a structured failure that explains what happened, why it likely happened, and what the user can do about it. Failure responses from the server SHALL carry a typed reason discriminator and structured diagnostics; the panel SHALL render both. Silent fallbacks (single boolean signal with no explanation) SHALL be eliminated.

#### Scenario: Typed reason on every failure

- **GIVEN** the handoff route is asked to resolve a workflow that cannot be resumed
- **WHEN** the route returns its payload
- **THEN** the payload SHALL include `outcome.kind === 'unresumable'`
- **AND** the payload SHALL include `outcome.reason` set to one of: `workflow-not-found`, `no-session-id-captured`, `host-binary-missing` (the `session-id-captured-but-unlinked` case is subsumed by the JSONL recovery primitive — captured-but-unlinked sessions are recovered transparently before the outcome is computed, so the user-facing union has no need to expose the intermediate state)
- **AND** the payload SHALL include `outcome.diagnostics` with at minimum: `vendor`, `vendorBinaryAvailable`, `invocationsForWorkflow`, `sessionIdEventsObserved`, `remediation` (human-readable string)

#### Scenario: Per-reason microcopy

- **GIVEN** the panel receives an `unresumable` outcome
- **WHEN** the panel renders
- **THEN** the panel SHALL render a headline (e.g. "This session can't be resumed"), a cause sentence (e.g. "AI never emitted a session id"), and a remediation sentence (e.g. "Update Claude Code: npm i -g @anthropic-ai/claude-code") looked up by `reason`
- **AND** the microcopy mapping SHALL live in a single dedicated server-side file so updates do not require touching React

#### Scenario: Diagnostics block visible to user

- **GIVEN** the panel renders an `unresumable` outcome
- **WHEN** the user views the panel body
- **THEN** the panel SHALL display the diagnostics block: vendor name (or "unknown"), whether the vendor binary is on PATH, the count of invocations observed for this workflow, and the count of `session_id` events observed
- **AND** the user SHALL be able to copy the diagnostics block as plain text for issue reports

#### Scenario: No fabricated commands on failure

- **GIVEN** any `unresumable` outcome
- **WHEN** the panel renders
- **THEN** no copyable command SHALL be presented to the user
- **AND** any command-specific UI affordances (Copy buttons, mode toggles) SHALL be hidden

#### Scenario: Microcopy completeness lint

- **GIVEN** the test suite runs in CI
- **WHEN** the lint test executes
- **THEN** every `UnresumableReason` variant SHALL have a corresponding microcopy entry
- **AND** the lint test SHALL fail if a new variant is added without an entry

### Requirement: Review Render Tree Degrades Gracefully on Unknown Values

The dashboard review-report render tree SHALL tolerate unrecognized enum values and missing optional metadata instead of throwing a render error that blanks the page. A lookup keyed by free-form parsed content (e.g. a discourse-block type, a verdict label, a reviewer icon) SHALL resolve to a neutral fallback rather than dereferencing an undefined config.

#### Scenario: Unknown discourse type renders a neutral block

- **WHEN** a review report contains a discourse section whose type is not one of the recognized values
- **THEN** the block SHALL render with a neutral style and the raw type as its label
- **AND** the review report SHALL NOT crash

#### Scenario: Missing reviewer icon renders a default glyph

- **WHEN** a reviewer is rendered whose `icon` is unset or not in the icon registry
- **THEN** a default glyph SHALL be shown rather than throwing

#### Scenario: Render errors are diagnosable

- **WHEN** a component within the dashboard error boundary throws during render
- **THEN** the error boundary SHALL log the React component stack so the failing subtree can be identified

### Requirement: Adapter Declares Sub-Agent Spawn Capability

Each AI CLI adapter SHALL declare a `supportsSubagentSpawn` capability indicating whether the host CLI can spawn isolated reviewer sub-agents from within its own agent runtime. This is orthogonal to `supportsPerTaskModel`: a host MAY support spawning sub-agents while not supporting per-task model overrides. The capability lets the dashboard-orchestrated path select a Phase-4 strategy programmatically.

#### Scenario: Claude Code declares sub-agent spawn support

- **GIVEN** the Claude Code adapter
- **WHEN** its capabilities are read
- **THEN** `supportsSubagentSpawn` SHALL be `true`

#### Scenario: Capability is independent of per-task model support

- **GIVEN** an adapter that can spawn sub-agents but cannot vary model per sub-agent
- **WHEN** its capabilities are read
- **THEN** `supportsSubagentSpawn` SHALL be `true` and `supportsPerTaskModel` SHALL be `false`

### Requirement: Process-Supervision Liveness Sweep

The dashboard periodically reclaims `command_executions` rows whose supervised process is genuinely gone, stamping them `orphaned` (`exit_code = -3`). Because the supervision journal is the source of truth for a command's outcome, the sweep SHALL ground the terminal `orphaned` verdict in **actual process liveness**, never in heartbeat age alone — a terminal verdict requires positive evidence that the process is dead. `last_heartbeat_at` age is a non-terminal display hint only.

#### Scenario: A live process is never orphaned

- **GIVEN** an unfinished `command_executions` row whose recorded `pid` is a live process
- **WHEN** the liveness sweep runs, even if `last_heartbeat_at` is older than the threshold
- **THEN** the row SHALL NOT be marked `orphaned` and SHALL retain `finished_at IS NULL`
- **AND** a stale heartbeat SHALL surface only as the non-terminal `stalled` display state

#### Scenario: A dead process is reclaimed

- **GIVEN** an unfinished row whose recorded `pid` is confirmed not alive (the OS reports no such process)
- **WHEN** the liveness sweep runs and the row is within the PID-reuse safety window
- **THEN** the row SHALL be marked `orphaned` (`exit_code = -3`, `finished_at` set, `pid` cleared, a structured note appended)

#### Scenario: No positive evidence of death means no terminal verdict

- **GIVEN** an unfinished row with no recorded `pid` (e.g. a self-reporting `start-instance` reviewer), OR a pid-bearing row whose `started_at` is older than the 24h PID-reuse safety window
- **WHEN** the liveness sweep runs
- **THEN** the row SHALL NOT be orphaned by this sweep — a self-reported stale heartbeat is a liveness hint (the non-terminal `stalled` display state), never positive evidence of death
- **AND** such rows are reclaimed instead by their evidence-bearing owners: the agent's own `ocr session end-instance`, the parent-close cascade (`cascadeTerminateExecutions`, exit `-4`), or the coarse session-level stale sweep

#### Scenario: A real completion always wins, and the sweep is idempotent

- **WHEN** a command finishes normally between the sweep's read and its write
- **THEN** the sweep's orphan stamp SHALL be a compare-and-set guarded on `finished_at IS NULL`, so the genuine exit code is never overwritten
- **AND** a second sweep over an already-reclaimed row SHALL make no further change

#### Scenario: A dead workflow process takes its in-flight dependents with it

- **GIVEN** the row being orphaned is a workflow's supervising/top-level process (it has a `workflow_id` and is not itself a `session-instance` reviewer row)
- **WHEN** the sweep confirms that process dead and orphans it
- **THEN** in the same transaction it SHALL cascade-terminate that workflow's other in-flight `command_executions` rows with exit `-4` (cascade), since the parent's confirmed death is positive evidence its in-process children are gone — so reviewer instances do not linger as `stalled` and the session-level sweep is not wedged by them
- **AND** orphaning a `session-instance` row SHALL NOT cascade (an instance never owns a workflow's lifecycle), so a live sibling instance is never taken down

#### Scenario: The cascade reclaims processes, not the session's resumability (deliberate asymmetry)

- **GIVEN** a supervisor was orphaned and its dependents cascade-closed
- **THEN** the cascade SHALL affect only `command_executions` (process supervision); it SHALL NOT itself close the workflow's `sessions` row
- **AND** the `sessions` row remains `active` so the in-progress round stays resumable (re-running the workflow resumes it; `ocr state finish --abort` abandons it); its lifecycle is reclaimed at the coarse 7-day session-level sweep if neither happens
- **AND** consequently the `session_completeness` view reads `in_flight` / `open_no_artifact` (NOT a terminal state) for the workflow until that reconciliation — the user-observable surface of the deliberate asymmetry
- **AND** the dashboard's sweep log line SHALL report how many rows were cascade-closed

#### Scenario: A recycled PID that reads alive leaves the row in-flight (deliberate false-negative)

- **GIVEN** a supervisor died but the OS recycled its PID onto an unrelated live process within the 24h window
- **WHEN** the sweep probes the PID and finds it alive
- **THEN** the sweep SHALL decline to orphan the row (it cannot prove the original process is dead) — leaning toward leaving an alive-named row in-flight rather than risk a false terminal verdict; the row is reclaimed at the coarse session-level sweep

### Requirement: Verdict Badge Renders the Merge Gate with a Subordinate Residual-Work Chip

The round view SHALL render the verdict as a single headline badge representing
the **merge gate** (`APPROVE` / `REQUEST CHANGES` / `NEEDS DISCUSSION`), with
non-blocking residual work surfaced as a **subordinate chip derived at render
time from the per-round counts** (`should_fix_count`, `suggestion_count`) — never
stored in or inferred from the verdict string. The badge and the chip SHALL be
visually distinct so the merge decision is not confused with the amount of
leftover work. The three status axes — round **verdict** (the decision),
round-level **triage** aggregate, and per-**finding** triage — SHALL each use a
distinct visual treatment so they are not mistaken for one another.

#### Scenario: Approve with residual work shows a chip, not a different verdict
- **GIVEN** a round whose verdict is `APPROVE` with `should_fix_count = 2` and `suggestion_count = 3`
- **WHEN** the round view renders
- **THEN** a single `APPROVE` verdict badge SHALL be shown
- **AND** a subordinate residual-work chip SHALL summarize the counts (e.g. "2 follow-ups · 3 suggestions"), with follow-ups visually weighted over suggestions
- **AND** the residual work SHALL NOT alter or replace the `APPROVE` headline

#### Scenario: Clean approve shows no residual chip
- **GIVEN** a round whose verdict is `APPROVE` with zero should-fix and zero suggestion findings
- **WHEN** the round view renders
- **THEN** the `APPROVE` badge SHALL be shown with no residual-work chip (or an explicit "clean" affordance)

#### Scenario: Status axes are visually separated
- **WHEN** a round view shows the verdict, the round-level triage aggregate, and the per-finding triage in the findings table
- **THEN** the verdict SHALL render as one bold headline badge, the round-level triage as a subordinate aggregate, and per-finding triage as per-row indicators
- **AND** the three SHALL be distinguishable at a glance and not share an identical badge style

### Requirement: Verdict Read-Time Normalization

When ingesting orchestrator round metadata, the dashboard SHALL normalize the
verdict through the shared `@open-code-review/platform` `normalizeVerdict`
function before storing and before emitting socket updates, so legacy and
aliased values map to a canonical state. A value that cannot be normalized SHALL
be stored as-is and SHALL render via the neutral graceful-degradation fallback
rather than as a raw, unstyled token.

#### Scenario: Legacy composite verdict normalizes to a canonical state
- **GIVEN** a `round-meta.json` whose `verdict` is a retired/aliased value such as `accept_with_followups`
- **WHEN** FilesystemSync processes it
- **THEN** the stored verdict SHALL be the canonical mapping (`APPROVE`)
- **AND** the round's residual work SHALL continue to be conveyed by its finding counts

#### Scenario: Unknown verdict degrades gracefully
- **WHEN** a verdict value cannot be mapped to any canonical state or alias
- **THEN** the raw value SHALL be stored and the badge SHALL render via the neutral fallback (no crash, no raw "?" as the sole content)

### Requirement: Findings Table Has Loading, Empty, and Degraded States

The findings table SHALL render explicit loading, empty, and degraded states
instead of an indefinite blank region, and its severity sort SHALL be robust to
unrecognized severity values (an unknown severity SHALL sort to a defined
position rather than poisoning the comparison with `NaN`).

#### Scenario: Loading state
- **WHEN** a round's findings have not yet been loaded
- **THEN** the table SHALL show a loading affordance rather than an empty region

#### Scenario: Empty state
- **WHEN** a round has zero findings
- **THEN** the table SHALL show an explicit empty state (e.g. "No findings")

#### Scenario: Unknown severity sorts deterministically
- **GIVEN** a finding whose severity is not one of the recognized values
- **WHEN** findings are sorted by severity
- **THEN** the unknown-severity row SHALL sort to a defined position and the sort SHALL NOT throw or produce a `NaN`-driven nondeterministic order

### Requirement: Full Process-Tree Reaping

When the dashboard terminates a spawned workflow (cancel, watchdog, shutdown, or singleton takeover), it SHALL terminate the entire descendant process tree, robust to children that escaped the root's process group via `setsid()` (e.g. a leaked MCP daemon). Detached workflow processes SHALL be `unref`'d so a wedged child never holds the dashboard's event loop open, and finalization SHALL be driven by the vendor `result` event and the watchdog rather than stdio EOF.

#### Scenario: Cancel reaps an escaped daemon

- **GIVEN** a detached review whose child spawned a daemon in its own process group
- **WHEN** the review is cancelled
- **THEN** the dashboard SHALL reap the whole descendant tree (SIGTERM → grace → SIGKILL), including the escaped daemon

### Requirement: Single Dashboard Instance

The dashboard SHALL run as a single instance. On startup, if a prior OCR-dashboard process is alive (identified by its command line, not just a PID file), the new server SHALL reap that prior process's tree and take over, rather than warning and coexisting on an incremented port. A PID that is not positively identified as an OCR dashboard SHALL NOT be reaped.

#### Scenario: Takeover of a prior live server

- **GIVEN** a prior OCR-dashboard process is alive when a new one starts
- **WHEN** the new server initializes
- **THEN** it SHALL reap the prior server's process tree (clearing any review subtree it leaked) and claim the port

#### Scenario: A recycled PID is not reaped

- **GIVEN** the dashboard PID file points at a live process that is not an OCR dashboard
- **THEN** the new server SHALL NOT reap it

### Requirement: File-Stdio Process Isolation

A detached workflow agent's stdout and stderr SHALL be redirected to a per-execution log file rather than OS pipes the dashboard holds. This removes the wedge at its root: a leaked grandchild that inherits the agent's file descriptors holds no pipe whose EOF the dashboard waits on, so `proc.on('close')` fires on the *direct* child's exit and finalization can never hang on stdio EOF. The dashboard SHALL stream the live output by tailing that log file through the same parser path used for pipe output, preserving multi-byte UTF-8 codepoints that straddle a read boundary, and SHALL drain the tail on close so no trailing output is lost. The tailer SHALL be released on every finalization path.

#### Scenario: A leaked grandchild cannot hold the output open

- **GIVEN** a detached workflow whose child spawned a daemon that inherits fd 1/2
- **WHEN** the direct agent process exits
- **THEN** the dashboard SHALL observe `close` and finalize, regardless of the still-living daemon

#### Scenario: Tailed output matches pipe output

- **GIVEN** a workflow streaming structured output (including non-ASCII) to its log file
- **WHEN** the dashboard tails the file
- **THEN** the parsed event stream SHALL be byte-equivalent to the pipe path, with no replacement characters at read boundaries
- **AND** the final bytes written just before exit SHALL be drained and parsed

### Requirement: Legacy Verdict/Finding Mismatch Hint

The dashboard SHALL surface a non-destructive **render-time mismatch hint** for
any round whose recorded `verdict` disagrees in direction with its deduplicated
blocker count (`resolveRoundCounts().blockerCount`) — the legacy shape the
shipped `verdict ↔ blocker-count` CLI gate now prevents for new rows but cannot
retroactively fix for already-stored rows. The hint SHALL be computed at read
time from the existing row; it SHALL NOT rewrite the stored verdict or counts,
and it SHALL NOT block rendering. New rows, gated by the CLI directional check,
never trigger it.

#### Scenario: APPROVE beside a non-zero blocker count shows a mismatch hint

- **GIVEN** a legacy round row recorded as `APPROVE` whose deduplicated blocker count is ≥ 1
- **WHEN** the round is rendered
- **THEN** the dashboard SHALL display a "verdict/finding mismatch" hint alongside the verdict badge
- **AND** it SHALL NOT rewrite the stored verdict or counts

#### Scenario: A consistent round shows no hint

- **GIVEN** a round whose verdict and deduplicated blocker count agree in direction
- **WHEN** the round is rendered
- **THEN** no mismatch hint SHALL be shown

### Requirement: DbSyncWatcher Auto-Forward-Resume of Stranded Sessions

In the dashboard-enhanced tier, the `DbSyncWatcher` SHALL detect a stranded mid-pipeline run (per `Forward-Resume of a Stranded Mid-Pipeline Run`) at its existing sweep trigger points and auto-spawn the host to continue, reusing the same `ocr review --resume` primitive a terminal operator would run — the watchdog owns only *triggering* and *bounding*, not a second resume code path. The auto-spawned turn is driven by the **canonical CONTROL prompt** (defined once in review-orchestration `Atomic Completion Contract`).

Auto-forward-resume SHALL fire only after positive death evidence exists for the owning turn (a clean parent-execution exit counts as positive death evidence; a stale heartbeat alone SHALL NOT suffice). It SHALL acquire the single-writer resume lease before spawning, SHALL be forward-only (never regressing `current_phase`), and SHALL be bounded by `runtime.forward_resume_max_attempts`; on cap exhaustion it SHALL drive the run to the non-success terminal close (`session_auto_closed_stale` with `{reason: "forward_resume_exhausted"}`) rather than retry. It SHALL NOT fabricate terminal completion from `final.md` presence. Auto-spawn requires a per-vendor resume adapter; on a host with no adapter the watchdog SHALL NOT auto-spawn and SHALL instead surface the "Pick up in terminal" handoff.

#### Scenario: Watchdog auto-resumes a dead, incomplete, mid-pipeline run

- **GIVEN** an `active` session stranded mid-pipeline with positive death evidence, a host that has a resume adapter, and attempts remaining
- **WHEN** the `DbSyncWatcher` sweep runs (startup or agent-session creation trigger)
- **THEN** it SHALL acquire the resume lease and invoke `ocr review --resume <workflow-session-id>` with the CONTROL prompt
- **AND** the continuation SHALL drive forward from `current_phase`, never regressing it

#### Scenario: Watchdog does not resume a live run

- **GIVEN** an `active` mid-pipeline session with a live `agent_sessions` instance or no positive death evidence
- **WHEN** the sweep runs
- **THEN** the watchdog SHALL NOT acquire a lease or spawn

#### Scenario: Watchdog on a host with no resume adapter hands off to terminal

- **GIVEN** a stranded run on a host with no per-vendor resume adapter
- **WHEN** the sweep runs
- **THEN** the watchdog SHALL NOT auto-spawn
- **AND** the dashboard SHALL surface the "Pick up in terminal" handoff for manual forward-resume

#### Scenario: Watchdog stops at the cap with a non-success close

- **GIVEN** a stranded run that has exhausted `forward_resume_max_attempts`
- **WHEN** the sweep runs
- **THEN** the watchdog SHALL NOT spawn again
- **AND** the run SHALL be closed non-success (`session_auto_closed_stale`, `forward_resume_exhausted`), never as a successful completion

### Requirement: Dashboard Rendering of Forward-Resume and Abort States

The dashboard SHALL render the new `next_action` states honestly and distinctly, so a stranded run never appears either as a fake success or as an inert blank. A `forward_resume` run SHALL render in the session liveness header as a recoverable stall (e.g. "Stalled — resuming" while a lease is live, "Stalled — recoverable" otherwise) with the "Continue here" affordance enabled (or "Pick up in terminal" when no resume adapter exists). An `abort_or_fresh` run SHALL render as a recoverable-failed state with explicit "Start fresh" / "Mark abandoned" affordances rather than a disabled "Continue here" with only a tooltip.

#### Scenario: A forward-resumable run renders as a recoverable stall

- **GIVEN** a session whose derived `next_action` is `forward_resume`
- **WHEN** its detail page is rendered
- **THEN** the liveness header SHALL show a recoverable-stall state (not "Complete", not a verdict badge)
- **AND** "Continue here" SHALL be enabled when a resume adapter exists, else "Pick up in terminal" SHALL be offered

#### Scenario: An abort_or_fresh run offers explicit recovery affordances

- **GIVEN** a session whose derived `next_action` is `abort_or_fresh` (cap exhausted or no legal forward edge)
- **WHEN** its detail page is rendered
- **THEN** the dashboard SHALL offer "Start fresh" and "Mark abandoned" affordances
- **AND** it SHALL NOT present the run as complete or successful

### Requirement: Shell-Parity Child Environment Inheritance

Dashboard-spawned child processes SHALL receive the environment of the shell
that launched `ocr dashboard` — captured as a snapshot at launch — minus only
the internal denylist, plus only registered injections. This covers every
child-carrying spawn path: AI CLI adapters, utility commands (including the
team and config routes' `ocr`/`git` spawns), `gh` invocations, and
forward-resume spawns. Argument-only diagnostic probes (adapter `--version`
detection, the `ps` process-identity check) MAY use the ambient environment,
and each such exception SHALL carry a per-line lint suppression stating the
rationale at the call site. No public configuration key SHALL govern this
behavior.

#### Scenario: Provider variable flows through

- **GIVEN** the user's shell exports `AWS_BEARER_TOKEN_BEDROCK` and
  `AWS_REGION`
- **WHEN** the dashboard spawns an AI review child
- **THEN** the child's environment SHALL contain both variables with the
  shell's values

#### Scenario: Snapshot precedes dashboard mutation

- **GIVEN** the shell that ran `ocr dashboard` had no `NODE_ENV` set
- **WHEN** the dashboard (which sets `NODE_ENV=production` for itself)
  spawns any child
- **THEN** the child's environment SHALL have no `NODE_ENV`
- **AND** the server process SHALL continue to observe
  `NODE_ENV=production`

#### Scenario: Snapshot is frozen at launch

- **GIVEN** the dashboard is running and the user exports a new variable in
  a different shell
- **WHEN** a child is spawned
- **THEN** the child SHALL NOT receive the new variable
- **AND** the documented remedy (restart `ocr dashboard`) SHALL appear in
  the startup output and `ocr doctor`

### Requirement: Single Frozen Snapshot With Set-Once Distribution

The child-env base SHALL be captured once, frozen at capture (null-prototype
object, `Object.freeze`), and registered exactly once. No spawn path SHALL
read `process.env` when constructing a child environment, nor fall back to
it when the snapshot is unregistered; direct `process.env` access in spawn
modules SHALL be forbidden by lint. (Server-configuration reads outside
child-env construction — e.g. `PORT`, the server's own `NODE_ENV`, IDE
detection — are unaffected.) `startServer` SHALL require a `childEnvBase`
parameter carrying the snapshot, its source (`cli-launch` or
`dev-direct-run`), and its capture timestamp.

#### Scenario: Use before init fails loud

- **GIVEN** server wiring attempts to build a child env before the snapshot
  is registered
- **WHEN** the snapshot holder's getter is called
- **THEN** it SHALL throw
- **AND** no fallback to `process.env` SHALL occur

#### Scenario: Re-init rejected

- **GIVEN** the snapshot has been registered
- **WHEN** the holder's init function is called a second time
- **THEN** it SHALL throw

#### Scenario: Snapshot source is visible

- **GIVEN** the dashboard was started via `ocr dashboard`
- **WHEN** startup output and a per-execution log header are emitted
- **THEN** both SHALL identify the snapshot source as `cli-launch` and carry
  the full ISO-8601 capture timestamp

### Requirement: Internal Environment Denylist By Criteria

The child-env builder SHALL remove only entries admitted under one of three
criteria: OCR-owned namespace; spawner-lifecycle residue the interactive
shell never had; or a named child-stability hazard with a written failure
mode. The current entries are the `OCR_` prefix, lowercase `npm_` residue
(with Windows-specific residue sub-namespace matching), `INIT_CWD`, and
`NODE_OPTIONS`. Matching SHALL be exact-case on POSIX and case-insensitive on
Windows for every entry. Denylist additions SHALL require a spec amendment
naming the admitting criterion and the concrete failure mode.
Secret-shaped and third-party provider names are categorically inadmissible.

#### Scenario: OCR namespace stripped while deliberate injection survives

- **GIVEN** the dashboard's snapshot contains a stale
  `OCR_DASHBOARD_EXECUTION_UID`
- **WHEN** it spawns an AI workflow child with a fresh per-spawn UID
- **THEN** the child SHALL receive exactly the fresh UID, never the stale
  inherited value

#### Scenario: npm residue stripped, user npm auth preserved on POSIX

- **GIVEN** the dashboard was launched via a package-manager runner (env
  contains `npm_config_registry`, `npm_lifecycle_event`, `INIT_CWD`) and the
  shell exports `NPM_TOKEN`
- **WHEN** a child is spawned on a POSIX platform
- **THEN** `npm_config_registry`, `npm_lifecycle_event`, and `INIT_CWD`
  SHALL be absent from the child env
- **AND** `NPM_TOKEN` SHALL be present

#### Scenario: NODE_OPTIONS stripped and reported

- **GIVEN** the shell exports `NODE_OPTIONS=--inspect`
- **WHEN** a child is spawned
- **THEN** the child's env SHALL lack `NODE_OPTIONS`
- **AND** the per-execution log header's removed list SHALL contain
  `NODE_OPTIONS`

#### Scenario: Case variants handled per platform

- **GIVEN** a Windows snapshot contains a key spelled `Node_Options`
- **WHEN** a child is spawned
- **THEN** the child's env SHALL contain no case variant of `NODE_OPTIONS`
  and the removed list SHALL report it
- **AND** on POSIX a variable literally named `node_options` SHALL pass
  through untouched

### Requirement: Closed Child-Env Injection Channel

Every child-carrying spawn SHALL construct its environment through the
single builder function (documented argument-only probe exceptions per the
Shell-Parity requirement). Injected keys SHALL be limited to a
compile-time-frozen allowed set (currently `OCR_DASHBOARD_EXECUTION_UID`),
enforced by a runtime error at the builder. Injected entries with undefined
values SHALL be omitted from both the output env and the injected-names
list. No socket-, HTTP-, or agent-derived value SHALL become or override
child env. Lint SHALL flag both divergence vectors: direct `process.env`
reads in spawn modules, and spawn calls whose arguments omit `env`.

#### Scenario: Unregistered inject key rejected at runtime

- **GIVEN** a caller passes an inject object containing a key outside the
  allowed set (e.g. `GIT_DIR`)
- **WHEN** the builder executes
- **THEN** it SHALL throw before any spawn occurs

#### Scenario: Forward-resume spawn uses the builder

- **GIVEN** the liveness sweep resumes a workflow via `ocr review --resume`
- **WHEN** that child is spawned
- **THEN** its environment SHALL equal the builder's output for the launch
  snapshot — notably containing no dashboard-mutated `NODE_ENV` and no
  inherited `OCR_*` values

### Requirement: Names-Only Child-Env Observability

OCR surfaces SHALL record the removed and injected variable names — never
values — for each spawn, derived from the same computation that built the
env, with full ISO-8601 snapshot timestamps. On a nonzero child exit, the
run's error surface SHALL show the removed-names list, the snapshot
timestamp, and the restart remedy; when `NODE_OPTIONS` was removed and the
shell had it set, the hint SHALL state that dashboard children run without
it. `ocr doctor` SHALL print the current posture, including the
`env -u VAR ocr dashboard` subtraction hint, generated from the same
constants that drive the builder.

#### Scenario: Failure-time hint

- **GIVEN** a spawned child exits nonzero
- **WHEN** the user opens the run's detail in the dashboard
- **THEN** the error surface SHALL show the removed-names list, the full
  snapshot timestamp, and the restart remedy
- **AND** if `NODE_OPTIONS` was removed and set in the shell, a sentence
  SHALL state that dashboard children run without it

#### Scenario: Values never logged

- **GIVEN** any spawn with removed or injected variables
- **WHEN** OCR writes the startup line, log headers, doctor output, or error
  hints
- **THEN** only variable names SHALL appear, never their values

