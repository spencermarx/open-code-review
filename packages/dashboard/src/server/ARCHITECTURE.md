# Dashboard Server Architecture

## Dual-Writer Ownership Model

The CLI and dashboard share a single SQLite database at `.ocr/data/ocr.db`.
Each process owns a distinct set of tables, avoiding write conflicts.

### CLI-Owned Tables (Workflow State)

The CLI owns all workflow orchestration state:

- **sessions** -- lifecycle, phase tracking, branch metadata
- **orchestration_events** -- phase transitions, workflow events
- **review_rounds** -- round metadata, verdicts, blocker counts
- **reviewer_outputs** -- per-reviewer file paths, finding counts
- **review_findings** -- individual findings parsed from reviewer output
- **map_runs** -- map run metadata, file counts
- **map_sections** -- section groupings within a map run
- **map_files** -- individual files within map sections
- **markdown_artifacts** -- raw markdown content for review/map outputs

The CLI writes to these tables during phase transitions and parse operations.
These writes are infrequent -- they happen at workflow boundaries (e.g., when
a review round completes or a map run finishes parsing).

### Dashboard-Owned Tables (User Interaction)

The dashboard owns all user-driven state:

- **user_file_progress** -- file review checkboxes
- **user_finding_progress** -- finding triage status (read, fixed, wont_fix, etc.)
- **user_round_progress** -- round-level triage status
- **user_notes** -- free-text notes attached to any entity
- **command_executions** -- command history and output logs
- **chat_conversations** -- AI chat session metadata
- **chat_messages** -- individual chat messages

These writes are user-driven and happen in response to UI interactions.

## Merge-Before-Write Pattern

Both processes use the sql.js in-memory database driver. Since they cannot
share a file-level WAL lock, the dashboard implements a merge-before-write
strategy:

1. Before exporting the in-memory DB to disk, the dashboard's `DbSyncWatcher`
   re-reads the CLI-owned tables from the on-disk file
2. It imports any new or updated rows into the in-memory database
3. Only then does it write the full database back to disk

This ensures CLI writes (which may have happened between dashboard saves)
are never overwritten. The `saveDb()` function accepts an optional
`preSaveSync` callback for this purpose.

## Atomic Write Pattern

All database writes to disk use a temp-file-then-rename strategy:

1. Export the in-memory database to `ocr.db.tmp`
2. `renameSync(ocr.db.tmp, ocr.db)` -- atomic on POSIX filesystems

This prevents the CLI (or any reader) from seeing a partially-written file.

## Why This Works

- **CLI writes are infrequent**: phase transitions happen at most a few times
  per review session, with minutes or hours between them.
- **Dashboard writes are user-driven**: they happen in response to button
  clicks and form submissions, not on automated schedules.
- **Table ownership is disjoint**: the CLI never writes to dashboard tables
  and the dashboard never writes to CLI tables, so there are no row-level
  conflicts to resolve.
- **Merge-before-write catches drift**: even if the CLI wrote while the
  dashboard was idle, the next dashboard save will incorporate those changes.
