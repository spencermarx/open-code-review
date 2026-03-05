/**
 * OCR State Management Module
 *
 * Manages session state exclusively through SQLite (.ocr/data/ocr.db).
 */

import type { Database } from "sql.js";
import { existsSync, readdirSync, statSync } from "node:fs";
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
} from "./types.js";

export type {
  InitParams,
  TransitionParams,
  CloseParams,
  ShowResult,
  WorkflowType,
  SessionStatus,
} from "./types.js";

/**
 * Initialize a new session in SQLite.
 */
export async function stateInit(params: InitParams): Promise<string> {
  const { sessionId, branch, workflowType, sessionDir, ocrDir } = params;
  const db = await ensureDatabase(ocrDir);
  const dbPath = join(ocrDir, "data", "ocr.db");

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
      status: session.status as "active" | "closed",
      workflow_type: session.workflow_type as "review" | "map",
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
    status: s.status as "active" | "closed",
    workflow_type: s.workflow_type as "review" | "map",
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
