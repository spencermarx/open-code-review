/**
 * JSONL-backed command history backup.
 *
 * Provides a durable append log for `command_executions` so that command
 * history can be recovered when the SQLite database is lost or recreated.
 *
 * The JSONL file is **write-only** during normal operation and **read-only**
 * during recovery. All writes are best-effort — a JSONL failure never
 * blocks the primary DB write path.
 *
 * The `output` field is intentionally excluded (can be megabytes).
 * Structural metadata (what ran, when, how it exited) is the irreplaceable
 * audit data worth backing up.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Database } from "sql.js";

// ── Types ──

export type CommandLogEvent = "start" | "finish" | "cancel";
export type CommandLogWriter = "dashboard" | "cli";

export type CommandLogEntry = {
  /** Schema version for forward compatibility. */
  v: number;
  /** Stable unique ID (UUIDv4) — dedup key for idempotent replay. */
  uid: string;
  /** Original DB auto-increment ID (informational, not used for dedup). */
  db_id: number;
  command: string;
  args: string | null;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
  is_detached: number;
  event: CommandLogEvent;
  writer: CommandLogWriter;
};

// ── Constants ──

const CACHE_DIR = ".cache";
const FILENAME = "command-history.jsonl";

/** Maximum lines before FIFO rotation triggers. */
const MAX_LINES = 5000;

/** Lines to keep after rotation (80% of max — provides headroom). */
const KEEP_LINES = 4000;

let approxLineCount = -1;

// ── Public API ──

/** Generate a stable UUID for a new command execution. */
export function generateCommandUid(): string {
  return randomUUID();
}

/** Resolve the `.ocr/data/.cache/` directory for JSONL backup files. */
export function cacheDir(ocrDir: string): string {
  return join(ocrDir, "data", CACHE_DIR);
}

/** Resolve the JSONL file path from the `.ocr/` directory. */
export function commandLogPath(ocrDir: string): string {
  return join(cacheDir(ocrDir), FILENAME);
}

/**
 * Append a single entry to the JSONL log.
 *
 * Best-effort: catches all errors silently. The JSONL is a backup —
 * failures must never block the primary DB write path.
 *
 * Uses `appendFileSync` which maps to `O_APPEND` on POSIX, providing
 * atomic appends for writes under the pipe buffer size (~4KB).
 * Each JSONL line is ~300 bytes, well within that limit.
 */
export function appendCommandLog(ocrDir: string, entry: CommandLogEntry): void {
  try {
    const filePath = commandLogPath(ocrDir);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(filePath, line, { encoding: "utf-8" });
    if (approxLineCount >= 0) approxLineCount++;
    rotateIfNeeded(filePath);
  } catch {
    // Silent — JSONL is a backup, not the critical path
  }
}

/**
 * Read all entries from the JSONL log.
 *
 * Skips malformed lines gracefully — a single corrupt line does not
 * prevent recovery of all other entries.
 */
export function readCommandLog(ocrDir: string): CommandLogEntry[] {
  const filePath = commandLogPath(ocrDir);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, "utf-8");
  const entries: CommandLogEntry[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as CommandLogEntry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

/**
 * Replay the JSONL log into an empty `command_executions` table.
 *
 * Collapses multiple events per `uid` to the latest state, skips
 * incomplete (start-only) records, and checks for existing rows
 * to ensure idempotent import.
 *
 * Returns the number of rows imported.
 */
export function replayCommandLog(db: Database, ocrDir: string): number {
  const entries = readCommandLog(ocrDir);
  if (entries.length === 0) return 0;

  // Collapse to latest event per uid
  const latest = new Map<string, CommandLogEntry>();
  for (const entry of entries) {
    if (!entry.uid || !entry.command || !entry.started_at) continue;
    const existing = latest.get(entry.uid);
    // Only 'start' events never overwrite — finish/cancel always take precedence
    if (!existing || entry.event !== "start") {
      latest.set(entry.uid, entry);
    }
  }

  let imported = 0;
  for (const entry of latest.values()) {
    // Skip start-only records (incomplete executions from before a crash)
    if (entry.event === "start" && !entry.finished_at) continue;

    // Idempotency check — skip if uid already exists in DB
    const existing = db.exec(
      "SELECT COUNT(*) as c FROM command_executions WHERE uid = ?",
      [entry.uid],
    );
    if (((existing[0]?.values[0]?.[0] as number) ?? 0) > 0) continue;

    db.run(
      `INSERT INTO command_executions
         (uid, command, args, exit_code, started_at, finished_at, pid, is_detached)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        entry.uid,
        entry.command,
        entry.args,
        entry.exit_code,
        entry.started_at,
        entry.finished_at,
        entry.is_detached,
      ],
    );
    imported++;
  }
  return imported;
}

// ── Internal ──

/**
 * FIFO rotation: when the JSONL exceeds MAX_LINES, atomically rewrite
 * keeping only the newest KEEP_LINES entries.
 *
 * Uses temp file + rename (matching the existing DB atomic write pattern).
 */
function rotateIfNeeded(filePath: string): void {
  try {
    if (approxLineCount >= 0 && approxLineCount <= MAX_LINES) return;

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    approxLineCount = lines.length;

    if (approxLineCount <= MAX_LINES) return;

    const kept = lines.slice(lines.length - KEEP_LINES);
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(tmpPath, kept.join("\n") + "\n", { encoding: "utf-8" });
    renameSync(tmpPath, filePath);
    approxLineCount = KEEP_LINES;
  } catch {
    // Silent — rotation failure is non-critical
  }
}
