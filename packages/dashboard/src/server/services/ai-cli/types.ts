/**
 * AI CLI adapter types.
 *
 * Defines the normalized interface that lets the dashboard work with
 * any AI coding CLI (Claude Code, OpenCode, etc.) through a common
 * spawn-and-stream contract.
 */

import type { ChildProcess } from 'node:child_process'

// ── Normalized Events ──
// All adapters parse their CLI's output format into these common events.
//
// The vocabulary is what the dashboard renders the live event stream from.
// Each event represents one observable thing the AI CLI did — emitted a
// chunk of message text, started thinking, called a tool, finished a tool,
// raised an error. Adapters DO NOT add execution/agent context — that is
// stamped on later by the command-runner when persisting + forwarding (see
// `StreamEvent`). Keeping adapters context-free makes them trivially
// testable and means new vendors only have to translate stdout.
//
// `tool_input_delta` was previously tunneled as a `tool_start` with magic
// name `__input_json_delta` — promoted here to a first-class variant.
//
// Sub-agent lifecycle (`agent_start`/`agent_end`) is deliberately NOT in
// this union. Sub-agents in OCR are journaled by the host AI calling
// `ocr session start-instance` / `end-instance` — they live in the
// `command_executions` table, not in the orchestrator's stdout stream.
// The client merges those rows with this event stream when rendering.

export type NormalizedEvent =
  /** Complete assistant message (a full message snapshot from the vendor). */
  | { type: 'message'; text: string }
  /** Streaming character delta within a message. Text accumulates per-block. */
  | { type: 'text_delta'; text: string }
  /** Streaming thinking-block delta. Multiple deltas per thinking block;
   *  the renderer closes the current thinking block when the next non-
   *  thinking event arrives — no explicit `thinking_end` event needed. */
  | { type: 'thinking_delta'; text: string }
  /** A tool invocation — name + initial input. May be followed by tool_input_delta if input streams. */
  | { type: 'tool_call'; toolId: string; name: string; input: Record<string, unknown> }
  /** Partial tool input JSON during streaming assembly. Append to the call's input buffer. */
  | { type: 'tool_input_delta'; toolId: string; deltaJson: string }
  /** Tool finished — its output (typically text). Pairs with the matching `tool_call.toolId`. */
  | { type: 'tool_result'; toolId: string; output: string; isError: boolean }
  /** A structured error from the agent or its process layer (distinct from process stderr). */
  | { type: 'error'; source: 'agent' | 'process'; message: string; detail?: string }
  /** Vendor session id captured from the stream — used for resume bookmarking. */
  | { type: 'session_id'; id: string }

// ── Stream Events ──
// What command-runner persists to JSONL and emits via socket. Adds the
// execution + agent + sequencing context the renderer needs.

export type StreamEvent = NormalizedEvent & {
  /** command_executions.id this event belongs to. */
  executionId: number
  /**
   * Which agent produced the event. For the orchestrator stream we always
   * use the literal `'orchestrator'`. Sub-agent ids are layered in by
   * future phases that merge command_executions rows into the feed.
   */
  agentId: string
  /** Optional parent for nested agents — populated when known. */
  parentAgentId?: string
  /** ISO 8601 timestamp at which the command-runner observed the event. */
  timestamp: string
  /** Monotonic per-execution sequence number — preserves order across reconnects. */
  seq: number
}

// ── Spawn Options ──

export type SpawnMode = 'workflow' | 'query'

export type SpawnOptions = {
  /** The prompt text to send to the AI CLI */
  prompt: string
  /** Working directory for the spawned process */
  cwd: string
  /** 'workflow' = multi-turn agentic (map, review), 'query' = single-turn (chat, post) */
  mode: SpawnMode
  /** Override max turns (default: 50 for workflow, 1 for query) */
  maxTurns?: number
  /** Tool allowlist (default: full set for workflow, read-only for query) */
  allowedTools?: string[]
  /** Session ID for conversation resume (Claude Code: --resume, OpenCode: TBD) */
  resumeSessionId?: string
  /**
   * Resolved model identifier passed verbatim to the underlying CLI's
   * `--model` flag. Strings are vendor-native — no OCR-coined aliases.
   * Omit to let the CLI's own default model apply.
   */
  model?: string
  /**
   * Extra environment variables merged into the spawned process. Used to
   * propagate context the AI's child `ocr` invocations need — currently
   * `OCR_DASHBOARD_EXECUTION_UID`, which lets `ocr state init` link the
   * new session row's id back to the dashboard's parent command_execution
   * row (so the handoff lookup can resolve the captured vendor_session_id).
   */
  env?: Record<string, string>
}

// ── Model Discovery ──

/**
 * Describes a single model that an adapter is willing to surface to users.
 * `id` is the literal string passed to `--model`. Other fields are optional
 * vendor-supplied hints — OCR does NOT invent tags like "fast" or "strong".
 */
export type ModelDescriptor = {
  id: string
  displayName?: string
  provider?: string
  tags?: string[]
}

export type SpawnResult = {
  process: ChildProcess
  /** Whether the process was spawned detached (enables process group kill) */
  detached: boolean
}

// ── Detection ──

export type DetectionResult = {
  found: boolean
  version?: string
}

// ── Stateful line parser ──
//
// Some vendors (Claude Code) stream tool input as a sequence of
// `input_json_delta` chunks that need to be assembled across many lines
// before the corresponding `tool_call` can be emitted with a complete
// input. Each spawn calls `adapter.createParser()` once and feeds every
// stdout line through the returned parser. The parser holds per-spawn
// state so the adapter instance itself stays shared and stateless.
export interface LineParser {
  /** Parse a single line of structured output into normalized events. */
  parseLine(line: string): NormalizedEvent[]
}

// ── Adapter Interface ──
// Kept as interface because it is used with `implements` by adapter classes.

export interface AiCliAdapter {
  /** Human-readable name (e.g., 'Claude Code', 'OpenCode') */
  readonly name: string
  /** Binary name used for detection and display (e.g., 'claude', 'opencode') */
  readonly binary: string
  /**
   * Whether the underlying CLI supports per-task (per-subagent) model
   * overrides. When `false`, configured per-instance models in OCR's
   * `default_team` are honored only at the *parent* level — the user is
   * shown a structured warning and reviewers run on the parent's model.
   */
  readonly supportsPerTaskModel: boolean
  /**
   * Returns the argv (binary excluded) for resuming a session with this
   * vendor's CLI. Canonical form — call this when you intend to
   * `spawn()` the vendor process. Owned by the adapter so the
   * SessionCaptureService stays vendor-agnostic.
   */
  buildResumeArgs(vendorSessionId: string): string[]
  /**
   * The shell command string a user can paste to resume an existing
   * session via this vendor's CLI. Derived from `buildResumeArgs` —
   * never hand-rolled — so the panel display string and the spawn
   * argv cannot drift in shape.
   *
   * Rendered verbatim in the dashboard's terminal-handoff panel.
   */
  buildResumeCommand(vendorSessionId: string): string
  /** Check if the binary is available and return version info */
  detect(): DetectionResult
  /** Spawn an AI process with the given options */
  spawn(opts: SpawnOptions): SpawnResult
  /** Returns a fresh stateful parser. Call once per spawn. */
  createParser(): LineParser
  /**
   * Parse a single line via a fresh stateless parser. Convenience for tests
   * and one-off use; production callers that process many lines from one
   * spawn should use `createParser()` so the parser can correlate streaming
   * partial events (e.g. tool input deltas) across line boundaries.
   */
  parseLine(line: string): NormalizedEvent[]
  /**
   * Surfaces models the underlying CLI is willing to accept. Must never
   * throw — implementations should fall back through:
   *
   *   1. Native CLI enumeration (`<binary> models --json`, etc.) when available
   *   2. A small bundled known-good list (best-effort, may go stale)
   *   3. An empty list — callers are expected to allow free-text input as
   *      the final escape hatch, never gatekeep against the CLI's own validation
   */
  listModels(): Promise<ModelDescriptor[]>
}

// ── Service Status ──

export type AiCliStatus = {
  /** Which AI CLIs are installed (e.g., ['claude', 'opencode']) */
  available: string[]
  /** Which CLI is actively being used (null if none available) */
  active: string | null
  /** User preference from config.yaml (e.g., 'auto', 'claude', 'opencode') */
  preferred: string
}
