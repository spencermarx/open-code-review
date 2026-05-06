# Dashboard Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
