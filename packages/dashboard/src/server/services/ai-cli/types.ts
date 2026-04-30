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

export type NormalizedEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; input: Record<string, unknown> }
  | { type: 'tool_end'; blockIndex: number }
  | { type: 'thinking' }
  | { type: 'full_text'; text: string }
  | { type: 'session_id'; id: string }

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
  /** Check if the binary is available and return version info */
  detect(): DetectionResult
  /** Spawn an AI process with the given options */
  spawn(opts: SpawnOptions): SpawnResult
  /** Parse a single line of structured output into normalized events */
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
