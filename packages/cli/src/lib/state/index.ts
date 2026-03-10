/**
 * OCR State Management Module
 *
 * Manages session state exclusively through SQLite (.ocr/data/ocr.db).
 */

import type { Database } from "sql.js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  ensureDatabase,
  saveDatabase,
  insertSession,
  updateSession,
  getSession,
  getLatestActiveSession,
  getAllSessions,
  insertEvent,
  getEventsForSession,
} from "../db/index.js";
import { join } from "node:path";
import type {
  InitParams,
  TransitionParams,
  CloseParams,
  ShowResult,
  RoundCompleteParams,
  RoundCompleteResult,
  RoundMeta,
  RoundMetaFinding,
  SynthesisCounts,
  MapCompleteParams,
  MapCompleteResult,
  MapMeta,
} from "./types.js";

export type {
  InitParams,
  TransitionParams,
  CloseParams,
  ShowResult,
  RoundCompleteParams,
  RoundCompleteResult,
  RoundMeta,
  RoundMetaFinding,
  SynthesisCounts,
  FindingCategory,
  FindingSeverity,
  WorkflowType,
  SessionStatus,
  ReviewPhase,
  MapPhase,
  MapCompleteParams,
  MapCompleteResult,
  MapMeta,
  MapMetaSection,
  MapMetaFile,
  MapMetaDependency,
} from "./types.js";

/**
 * Initialize a session in SQLite.
 *
 * If the session already exists (e.g. round-1 completed and closed),
 * re-opens it for the next round instead of failing silently on the
 * UNIQUE constraint.
 */
export async function stateInit(params: InitParams): Promise<string> {
  const { sessionId, branch, workflowType, sessionDir, ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

  const existing = getSession(db, sessionId);

  if (existing) {
    // Session exists — determine the correct round from filesystem
    const roundsDir = join(sessionDir, "rounds");
    let nextRound = 1;

    if (existsSync(roundsDir)) {
      const roundDirs = readdirSync(roundsDir)
        .filter((d) => /^round-\d+$/.test(d))
        .map((d) => parseInt(d.replace("round-", ""), 10))
        .sort((a, b) => a - b);

      if (roundDirs.length > 0) {
        const highest = roundDirs[roundDirs.length - 1]!;
        const hasFinal = existsSync(
          join(roundsDir, `round-${highest}`, "final.md"),
        );
        nextRound = hasFinal ? highest + 1 : highest;
      }
    }

    // Re-open the session for the next round
    updateSession(db, sessionId, {
      status: "active",
      current_phase: "context",
      phase_number: 1,
      current_round: nextRound,
    });

    insertEvent(db, {
      session_id: sessionId,
      event_type:
        nextRound > (existing.current_round ?? 1)
          ? "round_started"
          : "session_resumed",
      phase: "context",
      phase_number: 1,
      round: nextRound,
    });

    saveDatabase(db, dbPath);
    return sessionId;
  }

  // New session — original path
  insertSession(db, {
    id: sessionId,
    branch,
    workflow_type: workflowType,
    current_phase: "context",
    phase_number: 1,
    current_round: 1,
    current_map_run: 1,
    session_dir: sessionDir,
  });

  insertEvent(db, {
    session_id: sessionId,
    event_type: "session_created",
    phase: "context",
    phase_number: 1,
    round: 1,
  });

  saveDatabase(db, dbPath);

  return sessionId;
}

/**
 * Transition a session to a new phase in SQLite.
 */
export async function stateTransition(params: TransitionParams): Promise<void> {
  const { sessionId, phase, phaseNumber, round, mapRun, ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

  const existing = getSession(db, sessionId);
  if (!existing) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  const previousRound = existing.current_round;

  updateSession(db, sessionId, {
    current_phase: phase,
    phase_number: phaseNumber,
    ...(round !== undefined ? { current_round: round } : {}),
    ...(mapRun !== undefined ? { current_map_run: mapRun } : {}),
  });

  insertEvent(db, {
    session_id: sessionId,
    event_type: "phase_transition",
    phase,
    phase_number: phaseNumber,
    round: round ?? existing.current_round,
  });

  // If round changed, also insert a round_started event
  if (round !== undefined && round !== previousRound) {
    insertEvent(db, {
      session_id: sessionId,
      event_type: "round_started",
      phase,
      phase_number: phaseNumber,
      round,
    });
  }

  saveDatabase(db, dbPath);
}

/**
 * Close a session in SQLite.
 */
export async function stateClose(params: CloseParams): Promise<void> {
  const { sessionId, ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

  const existing = getSession(db, sessionId);
  if (!existing) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  updateSession(db, sessionId, {
    status: "closed",
    current_phase: "complete",
  });

  insertEvent(db, {
    session_id: sessionId,
    event_type: "session_closed",
    phase: "complete",
    phase_number: existing.phase_number,
    round: existing.current_round,
  });

  saveDatabase(db, dbPath);
}

/**
 * Show session state from SQLite.
 */
export async function stateShow(
  ocrDir: string,
  sessionId?: string,
): Promise<ShowResult | null> {
  let db: Database;
  try {
    db = await ensureDatabase(ocrDir);
  } catch {
    return null;
  }

  const session = sessionId
    ? getSession(db, sessionId)
    : getLatestActiveSession(db);

  if (!session) {
    return null;
  }

  const events = getEventsForSession(db, session.id);

  return {
    session: {
      id: session.id,
      branch: session.branch,
      status: session.status,
      workflow_type: session.workflow_type,
      current_phase: session.current_phase,
      phase_number: session.phase_number,
      current_round: session.current_round,
      current_map_run: session.current_map_run,
      started_at: session.started_at,
      updated_at: session.updated_at,
    },
    events: events.map((e) => ({
      id: e.id,
      event_type: e.event_type,
      phase: e.phase,
      phase_number: e.phase_number,
      round: e.round,
      metadata: e.metadata,
      created_at: e.created_at,
    })),
  };
}

/**
 * List all sessions from SQLite.
 */
export async function stateList(
  ocrDir: string,
): Promise<ShowResult["session"][]> {
  let db: Database;
  try {
    db = await ensureDatabase(ocrDir);
  } catch {
    return [];
  }

  const sessions = getAllSessions(db);
  return sessions.map((s) => ({
    id: s.id,
    branch: s.branch,
    status: s.status,
    workflow_type: s.workflow_type,
    current_phase: s.current_phase,
    phase_number: s.phase_number,
    current_round: s.current_round,
    current_map_run: s.current_map_run,
    started_at: s.started_at,
    updated_at: s.updated_at,
  }));
}

/**
 * Resolves the active session ID from SQLite.
 * Throws if no active session is found.
 */
export async function resolveActiveSession(
  ocrDir: string,
): Promise<{ id: string; sessionDir: string }> {
  const db = await ensureDatabase(ocrDir);
  const session = getLatestActiveSession(db);
  if (!session) {
    throw new Error("No active session found");
  }
  return {
    id: session.id,
    sessionDir: session.session_dir,
  };
}

// ── Shared completion helpers ──

/**
 * Read raw JSON string from either a file path or a raw data string.
 */
function readJsonFromSource(
  params: { source: "file"; filePath: string } | { source: "stdin"; data: string },
): string {
  if (params.source === "file") {
    if (!existsSync(params.filePath)) {
      throw new Error(`File not found: ${params.filePath}`);
    }
    return readFileSync(params.filePath, "utf-8");
  }
  return params.data;
}

/**
 * Parse a raw JSON string, throwing a descriptive error on failure.
 */
function parseRawJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${label}: ${err instanceof Error ? err.message : "invalid JSON"}`,
    );
  }
}

/**
 * Resolve the active session for a completion command.
 * Uses explicit ID if provided, otherwise falls back to the latest active session.
 */
function resolveSessionForCompletion(
  db: Database,
  explicitId?: string,
): { id: string; session_dir: string; current_round: number; current_map_run: number } {
  if (explicitId) {
    const existing = getSession(db, explicitId);
    if (!existing) throw new Error(`Session not found: ${explicitId}`);
    return {
      id: existing.id,
      session_dir: existing.session_dir,
      current_round: existing.current_round,
      current_map_run: existing.current_map_run,
    };
  }
  const active = getLatestActiveSession(db);
  if (!active) throw new Error("No active session found");
  return {
    id: active.id,
    session_dir: active.session_dir,
    current_round: active.current_round,
    current_map_run: active.current_map_run,
  };
}

// ── Round-meta validation helpers ──

const VALID_CATEGORIES = new Set(["blocker", "should_fix", "suggestion", "style"]);
const VALID_SEVERITIES = new Set(["critical", "high", "medium", "low", "info"]);

function validateRoundMeta(meta: unknown): RoundMeta {
  if (!meta || typeof meta !== "object") {
    throw new Error("round-meta.json must be a JSON object");
  }

  const obj = meta as Record<string, unknown>;

  if (obj.schema_version !== 1) {
    throw new Error(
      `Unsupported schema_version: ${String(obj.schema_version)}. Expected 1.`,
    );
  }

  if (typeof obj.verdict !== "string" || obj.verdict.trim().length === 0) {
    throw new Error("round-meta.json must contain a non-empty verdict string");
  }

  if (!Array.isArray(obj.reviewers)) {
    throw new Error("round-meta.json must contain a reviewers array");
  }

  for (const reviewer of obj.reviewers) {
    if (!reviewer || typeof reviewer !== "object") {
      throw new Error("Each reviewer must be an object");
    }
    const r = reviewer as Record<string, unknown>;
    if (typeof r.type !== "string") {
      throw new Error("Each reviewer must have a type string");
    }
    if (typeof r.instance !== "number") {
      throw new Error("Each reviewer must have an instance number");
    }
    if (!Array.isArray(r.findings)) {
      throw new Error(`Reviewer ${r.type}-${r.instance} must have a findings array`);
    }
    for (const finding of r.findings) {
      if (!finding || typeof finding !== "object") {
        throw new Error("Each finding must be an object");
      }
      const f = finding as Record<string, unknown>;
      if (typeof f.title !== "string" || f.title.trim().length === 0) {
        throw new Error("Each finding must have a non-empty title");
      }
      if (typeof f.category !== 'string' || !VALID_CATEGORIES.has(f.category)) {
        throw new Error(
          `Finding "${f.title}" has invalid category: "${String(f.category)}". Must be one of: ${[...VALID_CATEGORIES].join(", ")}`,
        );
      }
      if (typeof f.severity !== 'string' || !VALID_SEVERITIES.has(f.severity)) {
        throw new Error(
          `Finding "${f.title}" has invalid severity: "${String(f.severity)}". Must be one of: ${[...VALID_SEVERITIES].join(", ")}`,
        );
      }
      if (typeof f.summary !== "string") {
        throw new Error(`Finding "${f.title}" must have a summary string`);
      }
      if (f.file_path !== undefined && typeof f.file_path !== "string") {
        throw new Error(`Finding "${f.title}" has invalid file_path: expected string`);
      }
      if (f.line_start !== undefined && typeof f.line_start !== "number") {
        throw new Error(`Finding "${f.title}" has invalid line_start: expected number`);
      }
      if (f.line_end !== undefined && typeof f.line_end !== "number") {
        throw new Error(`Finding "${f.title}" has invalid line_end: expected number`);
      }
      if (f.flagged_by !== undefined && !Array.isArray(f.flagged_by)) {
        throw new Error(`Finding "${f.title}" has invalid flagged_by: expected array`);
      }
    }
  }

  // Validate optional synthesis_counts
  if (obj.synthesis_counts !== undefined) {
    if (!obj.synthesis_counts || typeof obj.synthesis_counts !== "object") {
      throw new Error("synthesis_counts must be an object");
    }
    const sc = obj.synthesis_counts as Record<string, unknown>;
    if (typeof sc.blockers !== "number" || sc.blockers < 0) {
      throw new Error("synthesis_counts.blockers must be a non-negative number");
    }
    if (typeof sc.should_fix !== "number" || sc.should_fix < 0) {
      throw new Error("synthesis_counts.should_fix must be a non-negative number");
    }
    if (typeof sc.suggestions !== "number" || sc.suggestions < 0) {
      throw new Error("synthesis_counts.suggestions must be a non-negative number");
    }
  }

  return meta as RoundMeta;
}

/**
 * Compute counts for a RoundMeta.
 *
 * When `synthesis_counts` is present, those values are preferred because they
 * reflect the **deduplicated, post-synthesis** totals matching `final.md`.
 * The per-reviewer findings array can contain duplicates (the same issue
 * flagged by multiple reviewers), so derived counts may exceed the actual
 * number of unique items in the synthesis.
 *
 * `reviewerCount` and `totalFindingCount` are always derived from the data
 * (they aren't affected by deduplication).
 *
 * Note: `style` findings are intentionally included only in `totalFindingCount`
 * and do not have a separate named counter. The dashboard displays them as part
 * of the total but does not break them out in summary cards.
 */
export function computeRoundCounts(meta: RoundMeta): {
  blockerCount: number;
  shouldFixCount: number;
  suggestionCount: number;
  reviewerCount: number;
  totalFindingCount: number;
} {
  const allFindings: RoundMetaFinding[] = [];
  for (const reviewer of meta.reviewers) {
    allFindings.push(...reviewer.findings);
  }

  // Prefer explicit synthesis counts (deduplicated) over derived counts
  const sc = meta.synthesis_counts;

  return {
    blockerCount: sc ? sc.blockers : allFindings.filter((f) => f.category === "blocker").length,
    shouldFixCount: sc ? sc.should_fix : allFindings.filter((f) => f.category === "should_fix").length,
    suggestionCount: sc ? sc.suggestions : allFindings.filter((f) => f.category === "suggestion").length,
    reviewerCount: meta.reviewers.length,
    totalFindingCount: allFindings.length,
  };
}

/**
 * Import structured review round data into SQLite.
 *
 * Accepts data from either a file path (`source: "file"`) or a raw JSON
 * string (`source: "stdin"`). Validates the schema, computes derived counts,
 * and writes a `round_completed` orchestration event.
 *
 * When `source` is `"stdin"`, the CLI also writes `round-meta.json` to the
 * correct session round directory — making the CLI the sole writer of all
 * stateful artifacts.
 */
export async function stateRoundComplete(
  params: RoundCompleteParams,
): Promise<RoundCompleteResult> {
  const { ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

  // ── 1. Read and parse JSON ──
  const rawJsonString = readJsonFromSource(params);
  const label = params.source === "file" ? params.filePath : "stdin";
  const raw = parseRawJson(rawJsonString, label);

  // ── 2. Validate and compute counts ──
  const meta = validateRoundMeta(raw);
  const counts = computeRoundCounts(meta);

  // ── 3. Resolve session and round ──
  const session = resolveSessionForCompletion(db, params.sessionId);
  const roundNumber = params.round ?? session.current_round;

  // ── 4. Write round-meta.json when source is stdin ──
  let metaPath: string | undefined;
  if (params.source === "stdin") {
    const roundDir = join(session.session_dir, "rounds", `round-${roundNumber}`);
    mkdirSync(roundDir, { recursive: true });
    metaPath = join(roundDir, "round-meta.json");
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  // ── 5. Write orchestration event with all data in metadata ──
  insertEvent(db, {
    session_id: session.id,
    event_type: "round_completed",
    phase: "synthesis",
    phase_number: 7,
    round: roundNumber,
    metadata: JSON.stringify({
      verdict: meta.verdict,
      blocker_count: counts.blockerCount,
      should_fix_count: counts.shouldFixCount,
      suggestion_count: counts.suggestionCount,
      reviewer_count: counts.reviewerCount,
      total_finding_count: counts.totalFindingCount,
      source: "orchestrator",
    }),
  });

  saveDatabase(db, dbPath);

  return { sessionId: session.id, round: roundNumber, metaPath };
}

// ── Map-meta validation helpers ──

function validateMapMeta(meta: unknown): MapMeta {
  if (!meta || typeof meta !== "object") {
    throw new Error("map-meta.json must be a JSON object");
  }

  const obj = meta as Record<string, unknown>;

  if (obj.schema_version !== 1) {
    throw new Error(
      `Unsupported schema_version: ${String(obj.schema_version)}. Expected 1.`,
    );
  }

  if (!Array.isArray(obj.sections)) {
    throw new Error("map-meta.json must contain a sections array");
  }

  for (const section of obj.sections) {
    if (!section || typeof section !== "object") {
      throw new Error("Each section must be an object");
    }
    const s = section as Record<string, unknown>;
    if (typeof s.section_number !== "number") {
      throw new Error("Each section must have a section_number");
    }
    if (typeof s.title !== "string" || s.title.trim().length === 0) {
      throw new Error("Each section must have a non-empty title");
    }
    if (!Array.isArray(s.files)) {
      throw new Error(`Section "${s.title}" must have a files array`);
    }
    for (const file of s.files) {
      if (!file || typeof file !== "object") {
        throw new Error("Each file must be an object");
      }
      const f = file as Record<string, unknown>;
      if (typeof f.file_path !== "string" || f.file_path.trim().length === 0) {
        throw new Error("Each file must have a non-empty file_path");
      }
      if (typeof f.role !== "string") {
        throw new Error(`File "${f.file_path}" must have a role string`);
      }
      if (typeof f.lines_added !== "number") {
        throw new Error(`File "${f.file_path}" must have a lines_added number`);
      }
      if (typeof f.lines_deleted !== "number") {
        throw new Error(`File "${f.file_path}" must have a lines_deleted number`);
      }
    }
  }

  if (obj.dependencies !== undefined && !Array.isArray(obj.dependencies)) {
    throw new Error("map-meta.json dependencies must be an array if provided");
  }

  return meta as MapMeta;
}

/**
 * Compute derived counts from the sections array in a MapMeta.
 * Counts are NEVER self-reported — always derived from the data.
 */
export function computeMapCounts(meta: MapMeta): {
  sectionCount: number;
  fileCount: number;
} {
  return {
    sectionCount: meta.sections.length,
    fileCount: meta.sections.reduce((sum, s) => sum + s.files.length, 0),
  };
}

/**
 * Import structured map run data into SQLite.
 *
 * Accepts data from either a file path (`source: "file"`) or a raw JSON
 * string (`source: "stdin"`). Validates the schema, computes derived counts,
 * and writes a `map_completed` orchestration event.
 *
 * When `source` is `"stdin"`, the CLI also writes `map-meta.json` to the
 * correct session map run directory — making the CLI the sole writer of all
 * stateful artifacts.
 */
export async function stateMapComplete(
  params: MapCompleteParams,
): Promise<MapCompleteResult> {
  const { ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

  // ── 1. Read and parse JSON ──
  const rawJsonString = readJsonFromSource(params);
  const label = params.source === "file" ? params.filePath : "stdin";
  const raw = parseRawJson(rawJsonString, label);

  // ── 2. Validate and compute counts ──
  const meta = validateMapMeta(raw);
  const counts = computeMapCounts(meta);

  // ── 3. Resolve session and map run ──
  const session = resolveSessionForCompletion(db, params.sessionId);
  const mapRunNumber = params.mapRun ?? session.current_map_run;

  // ── 4. Write map-meta.json when source is stdin ──
  let metaPath: string | undefined;
  if (params.source === "stdin") {
    const runDir = join(session.session_dir, "map", "runs", `run-${mapRunNumber}`);
    mkdirSync(runDir, { recursive: true });
    metaPath = join(runDir, "map-meta.json");
    writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  // ── 5. Write orchestration event with all data in metadata ──
  // Note: `round` column stores the map run number for map_completed events.
  // This is an intentional schema overload to avoid a separate column.
  insertEvent(db, {
    session_id: session.id,
    event_type: "map_completed",
    phase: "synthesis",
    phase_number: 5,
    round: mapRunNumber,
    metadata: JSON.stringify({
      section_count: counts.sectionCount,
      file_count: counts.fileCount,
      source: "orchestrator",
    }),
  });

  saveDatabase(db, dbPath);

  return { sessionId: session.id, mapRun: mapRunNumber, metaPath };
}

/**
 * Sync filesystem sessions into SQLite.
 * Scans .ocr/sessions/ for session directories not yet in SQLite,
 * and backfills them using filesystem metadata (branch from dir name,
 * workflow type from directory structure).
 */
export async function stateSync(ocrDir: string): Promise<number> {
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");
  const sessionsRoot = join(ocrDir, "sessions");

  if (!existsSync(sessionsRoot)) {
    return 0;
  }

  const entries = readdirSync(sessionsRoot).filter((name) => {
    const fullPath = join(sessionsRoot, name);
    return statSync(fullPath).isDirectory();
  });

  let synced = 0;

  for (const dirName of entries) {
    const dirPath = join(sessionsRoot, dirName);

    // Check if already in SQLite
    const existing = getSession(db, dirName);
    if (existing) {
      continue;
    }

    // Derive workflow type from filesystem artifacts
    const hasRoundsDir = existsSync(join(dirPath, "rounds"));
    const hasMapDir = existsSync(join(dirPath, "map"));
    const workflowType = hasMapDir && !hasRoundsDir ? "map" : "review";

    // Extract branch from session ID pattern: YYYY-MM-DD-branch-name
    const branchMatch = dirName.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
    const branch = branchMatch?.[1] ?? dirName;

    insertSession(db, {
      id: dirName,
      branch,
      workflow_type: workflowType,
      current_phase: "context",
      phase_number: 1,
      current_round: 1,
      current_map_run: 1,
      session_dir: dirPath,
    });

    insertEvent(db, {
      session_id: dirName,
      event_type: "session_synced",
      phase: "context",
      phase_number: 1,
      metadata: JSON.stringify({ source: "filesystem_backfill" }),
    });

    synced++;
  }

  if (synced > 0) {
    saveDatabase(db, dbPath);
  }

  return synced;
}
