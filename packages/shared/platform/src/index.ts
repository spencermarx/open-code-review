/**
 * Cross-platform utilities for Open Code Review.
 *
 * Thin wrappers around Node.js built-in APIs that handle Windows-specific
 * requirements (file:// URLs for ESM imports, shell-less `.cmd`/`.bat` shim
 * resolution via cross-spawn — see `spawn.ts`; there is no interpreting shell).
 * These work identically on all platforms — no conditional branching needed
 * at call sites.
 */

import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export { execBinary, execBinaryAsync, spawnBinary } from "./spawn.js";
export type { ExecBinaryAsyncOptions, ExecError } from "./spawn.js";

export {
  CANONICAL_VERDICTS,
  isCanonicalVerdict,
  normalizeVerdict,
} from "./verdict.js";
export type { CanonicalVerdict } from "./verdict.js";

export {
  ALLOWED_INJECT_KEYS,
  buildChildEnv,
  buildChildEnvForPlatform,
  describeChildEnvPosture,
} from "./child-env.js";
export type { ChildEnvInject, ChildEnvResult } from "./child-env.js";

export {
  FINDING_CATEGORIES,
  deriveCounts,
  resolveRoundCounts,
} from "./counts.js";
export type {
  FindingCategory,
  CategoryCounts,
  CountableFinding,
  CountableSynthesisCounts,
  CountableRoundMeta,
  ResolvedRoundCounts,
} from "./counts.js";

const isWindows = process.platform === "win32";

/**
 * Dynamically import a module from an absolute file path.
 *
 * Converts the path to a `file://` URL before importing, which is required
 * on Windows and harmless on POSIX. This is the canonical approach recommended
 * by the Node.js ESM documentation.
 */
export async function importModule<T = Record<string, unknown>>(
  absolutePath: string,
): Promise<T> {
  return import(pathToFileURL(absolutePath).href) as Promise<T>;
}

// ── Process-tree reaping ──

/**
 * Classifies a `process.kill(pid, 0)` failure: only ESRCH ("no such
 * process") is positive evidence of death. EPERM means the process exists
 * but is not ours to signal — alive. Any other error, or a thrown
 * non-Error, cannot prove death, so the conservative verdict is alive.
 *
 * Exported as the single shared decision behind the platform's
 * `isProcessAlive` and the CLI's `defaultIsAlive` (previously duplicated),
 * and so the errno contract is testable deterministically on every OS —
 * the old tests manufactured EPERM by probing pid 1, which does not exist
 * on Windows (issue #41).
 */
export function killErrorMeansDead(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ESRCH";
}

/**
 * Whether a PID is currently signalable (alive). `process.kill(pid, 0)` sends
 * no signal; only an `ESRCH` error is positive evidence of death. Shares the
 * `killErrorMeansDead` classifier with the CLI's `defaultIsAlive` so callers
 * across packages share one liveness contract.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !killErrorMeansDead(err);
  }
}

/**
 * One descendant walk: the BFS result plus whether the enumerator (`ps`)
 * actually ran. Derived from the SAME invocation — not a second probe — so
 * the availability bit can never disagree with the walk it describes
 * (round-2 S5: the previous separate probe was TOCTOU-prone and doubled the
 * process spawns per reap).
 */
function walkDescendants(rootPid: number): {
  pids: number[];
  psAvailable: boolean;
} {
  if (isWindows) return { pids: [], psAvailable: false };
  let out: string;
  try {
    out = execFileSync("ps", ["-A", "-o", "pid=,ppid="], {
      encoding: "utf-8",
      timeout: 5000,
    }) as string;
  } catch {
    return { pids: [], psAvailable: false };
  }
  const children = new Map<number, number[]>();
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    const siblings = children.get(ppid) ?? [];
    siblings.push(pid);
    children.set(ppid, siblings);
  }
  const acc: number[] = [];
  const queue = [rootPid];
  const seen = new Set<number>([rootPid]);
  let p: number | undefined;
  while ((p = queue.shift()) !== undefined) {
    for (const c of children.get(p) ?? []) {
      if (seen.has(c)) continue;
      seen.add(c);
      acc.push(c);
      queue.push(c);
    }
  }
  return { pids: acc, psAvailable: true };
}

/**
 * Enumerate all descendant PIDs of `rootPid` (children, grandchildren, …).
 *
 * On POSIX, builds the full ppid→children map from one `ps -A` call and BFSs
 * from the root — this catches descendants that `setsid()`'d into their own
 * process group (which `kill(-pgid)` would miss). Returns [] on Windows (use
 * `reapTree`, which shells out to `taskkill /T`) or if `ps` is unavailable.
 */
export function descendantPids(rootPid: number): number[] {
  return walkDescendants(rootPid).pids;
}

/**
 * Diagnostic returned by {@link reapTree}. Reports only what is known
 * SYNCHRONOUSLY (the SIGTERM phase). The SIGKILL escalation runs after
 * `graceMs` so a straggler count cannot be in this struct — instead a WARN is
 * logged from the grace callback when any process survives the re-walk (the
 * exact "a leaked daemon refused to die" signal this primitive exists to catch).
 */
export type ReapResult = {
  /** Descendants + root we attempted to SIGTERM (POSIX — always >= 1, the
   *  root itself), or 1 for the Windows `taskkill /T` target. */
  signaled: number;
  /** Whether `ps` ran for the SIGTERM-phase walk (POSIX) — derived from that
   *  same walk, not a separate probe, so it cannot disagree with it. When
   *  false, only the root was signalled and a setsid()-escaped grandchild may
   *  have been missed; reapTree logs that degradation centrally. */
  psAvailable: boolean;
};

/**
 * Terminate an entire process tree (root + all descendants), robust to children
 * that escaped the root's process group via `setsid()` — the failure mode that
 * lets a leaked MCP daemon hold a parent's stdio pipe open forever.
 *
 * POSIX: SIGTERM every descendant (leaves first, root last), then after
 * `graceMs` re-walk and SIGKILL whatever is still alive. Windows: `taskkill /T
 * /F` from the root. Best-effort and never throws — reaping is hygiene.
 *
 * Returns a {@link ReapResult} for the SIGTERM phase; survivors of the deferred
 * SIGKILL grace are reported via `console.warn` (they're only knowable after
 * `graceMs`). Existing call sites may ignore the return — no control-flow change.
 */
export function reapTree(rootPid: number, graceMs = 5000): ReapResult {
  if (isWindows) {
    try {
      execFileSync("taskkill", ["/PID", String(rootPid), "/T", "/F"], {
        timeout: 5000,
      });
    } catch {
      /* already gone / not found */
    }
    return { signaled: 1, psAvailable: false };
  }
  const { pids: descendants, psAvailable } = walkDescendants(rootPid);
  if (!psAvailable) {
    // No production caller branches on the returned bit, so the degradation is
    // surfaced HERE, once, where it happens: without `ps` only the root can be
    // signalled and a setsid()-escaped grandchild survives the reap.
    console.warn(
      `[reapTree] 'ps' unavailable — signalling only the root (PID ${rootPid}); ` +
        `escaped descendants cannot be enumerated on this system.`,
    );
  }
  const term = [...descendants, rootPid];
  for (const pid of term) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => {
    // Re-walk: a child may have forked again between SIGTERM and now.
    const kill = [...descendantPids(rootPid), rootPid];
    let stragglers = 0;
    for (const pid of kill) {
      if (!isProcessAlive(pid)) continue;
      stragglers++;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    if (stragglers > 0) {
      // Counted BEFORE the kill attempt — these survived SIGTERM and are now
      // being sent SIGKILL (whether each SIGKILL landed is not re-verified).
      console.warn(
        `[reapTree] ${stragglers} process(es) under PID ${rootPid} survived SIGTERM ` +
          `after ${graceMs}ms; sending SIGKILL — investigate a leaked daemon.`,
      );
    }
  }, graceMs).unref();

  return { signaled: term.length, psAvailable };
}

// ── Reviewer icons ──

/**
 * Canonical icon mapping for built-in reviewers. The string values are
 * resolved to lucide-react glyphs by the dashboard's icon registry; the CLI
 * writes them verbatim into `reviewers-meta.json`. This is the single source
 * of truth shared by both packages so the two never drift.
 */
export const BUILTIN_ICON_MAP: Record<string, string> = {
  architect: "blocks",
  fullstack: "layers",
  reliability: "activity",
  "staff-engineer": "compass",
  principal: "crown",
  frontend: "layout",
  backend: "server",
  infrastructure: "cloud",
  performance: "gauge",
  accessibility: "accessibility",
  data: "database",
  devops: "rocket",
  dx: "terminal",
  mobile: "smartphone",
  security: "shield-alert",
  quality: "sparkles",
  testing: "test-tubes",
  ai: "bot",
  "docs-writer": "file-text",
};

/**
 * Resolve the default icon for a reviewer given its id and tier.
 *
 * Built-in reviewers get their mapped glyph; everything else falls back to a
 * tier-appropriate generic (`brain` for personas, `user` otherwise). This is
 * the authority every write/read boundary uses to guarantee a reviewer always
 * has a non-empty icon, so the dashboard never renders an `undefined` icon.
 *
 * `tier` is accepted as a plain string to avoid coupling this package to the
 * `ReviewerTier` union, which is declared separately in the CLI and dashboard.
 */
export function defaultIconFor(id: string, tier: string): string {
  return BUILTIN_ICON_MAP[id] ?? (tier === "persona" ? "brain" : "user");
}

// ── Host capabilities ──

/**
 * Capabilities of a host's agent runtime that govern how the review skill runs
 * Phase 4. Lives here so the CLI (install-time, via `getHostCapabilities`) and
 * the dashboard adapters (runtime, `supportsSubagentSpawn`/`supportsPerTaskModel`)
 * derive from ONE source and cannot silently diverge.
 */
export type HostCapabilities = {
  /**
   * The host's agent runtime can spawn isolated sub-agents (e.g. Claude Code's
   * Task tool, OpenCode's sub-agents). When false, Phase 4 runs reviewers
   * sequentially in the host's own conversation.
   */
  subagentSpawn: boolean;
  /** The host can vary the model per spawned sub-agent / per task. */
  perTaskModel: boolean;
};

/**
 * Conservative default for any host that does not declare capabilities: no
 * sub-agent spawning, no per-task model. Resolves to the sequential, single-
 * model Phase-4 strategy — the safe behavior for an unknown host.
 */
export const DEFAULT_HOST_CAPABILITIES: HostCapabilities = {
  subagentSpawn: false,
  perTaskModel: false,
};

/**
 * Canonical capability table, keyed by the host's CLI binary (which equals the
 * tool id for the spawnable agentic CLIs). The single source of truth shared by
 * the CLI tool registry and the dashboard adapters.
 */
const HOST_CAPABILITIES: Record<string, HostCapabilities> = {
  // Claude Code: Task tool + per-subagent model frontmatter.
  claude: { subagentSpawn: true, perTaskModel: true },
  // OpenCode: `--agent` sub-agent primitive, but no per-task model override.
  opencode: { subagentSpawn: true, perTaskModel: false },
  // Gemini CLI / Codex: no in-agent Task primitive → sequential Phase 4.
  gemini: { subagentSpawn: false, perTaskModel: false },
  codex: { subagentSpawn: false, perTaskModel: false },
};

/**
 * Resolve a host's Phase-4 capabilities by binary/id, falling back to the
 * conservative default for hosts that do not declare them. Never throws.
 */
export function hostCapabilitiesFor(vendor: string | undefined): HostCapabilities {
  return (vendor && HOST_CAPABILITIES[vendor]) || DEFAULT_HOST_CAPABILITIES;
}
