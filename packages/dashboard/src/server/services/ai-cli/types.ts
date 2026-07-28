/**
 * AI CLI adapter types.
 *
 * Defines the normalized interface that lets the dashboard work with
 * any AI coding CLI (Claude Code, OpenCode, etc.) through a common
 * spawn-and-stream contract.
 */

import type { ChildProcess } from 'node:child_process'
import type { ChildEnvInject } from '@open-code-review/platform'

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
  /**
   * A runner-originated operational notice — NOT agent output. Used for
   * conditions the command-runner itself surfaces (e.g. a per-instance model
   * dropped because the adapter lacks per-subagent model support, or a run
   * force-finalized at the hard deadline). Carries a stable `code` so the
   * timeline UI and history replay can render/filter it; routed through the
   * typed stream so it lands in the per-execution JSONL journal. */
  | { type: 'notice'; level: 'info' | 'warning'; code: string; message: string }
  /** Vendor session id captured from the stream — used for resume bookmarking. */
  | { type: 'session_id'; id: string }
  /**
   * The agent's turn loop has finished (vendor emitted its terminal result
   * line) — work is functionally done, emitted BEFORE the process necessarily
   * exits. The command-runner uses this as the primary finalize trigger so
   * finalization no longer hinges on stdio EOF (which a leaked grandchild can
   * hold open forever). `isError` reflects a failed / `error_max_turns` result. */
  | { type: 'result'; isError: boolean; subtype?: string }

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
   * Deliberate per-spawn injections, limited to the platform builder's
   * closed key set (runtime-enforced). Currently only
   * `OCR_DASHBOARD_EXECUTION_UID`, which lets `ocr state begin` link the
   * new session row's id back to the dashboard's parent command_execution
   * row (so the handoff lookup can resolve the captured vendor_session_id).
   */
  env?: ChildEnvInject
  /**
   * When set (workflow mode), the adapter redirects the spawned process's
   * stdout+stderr to THIS file instead of OS pipes, and the caller tails the
   * file for the live stream. This is the root-cause half of the wedge fix: a
   * leaked grandchild can inherit fd 1/2 without holding a pipe whose EOF the
   * dashboard waits on, so `proc.on('close')` fires on the direct child's exit.
   * Ignored for non-workflow spawns (which keep pipe stdio).
   */
  logFile?: string
}

export type SpawnResult = {
  process: ChildProcess
  /** Whether the process was spawned detached (enables process group kill) */
  detached: boolean
  /**
   * Set when the adapter redirected stdout/stderr to a log file (per
   * {@link SpawnOptions.logFile}). The caller tails this path for the live
   * stream instead of reading `process.stdout` (which is null in that case).
   */
  logPath?: string
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
   * Whether the host CLI can spawn isolated reviewer sub-agents from within
   * its own agent runtime (e.g. Claude Code's Task tool, OpenCode's subagent
   * primitive). When `false`, Phase 4 runs reviewers sequentially in the
   * parent conversation rather than as concurrent sub-agents. Orthogonal to
   * `supportsPerTaskModel`: a host can spawn sub-agents yet not vary their
   * model.
   */
  readonly supportsSubagentSpawn: boolean
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
