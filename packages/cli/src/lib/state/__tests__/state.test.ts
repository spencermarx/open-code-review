import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { closeAllDatabases } from "../../db/index.js";
import {
  stateInit,
  stateTransition,
  stateClose,
  stateShow,
  stateList,
  stateSync,
  resolveActiveSession,
} from "../index.js";

let tmpDir: string;
let ocrDir: string;
let sessionsDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ocr-state-test-"));
  ocrDir = join(tmpDir, ".ocr");
  sessionsDir = join(ocrDir, "sessions");
});

afterEach(() => {
  closeAllDatabases();
  rmSync(tmpDir, { recursive: true, force: true });
});

function sessionDir(sessionId: string): string {
  const dir = join(sessionsDir, sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("stateInit", () => {
  it("creates a session in SQLite and returns the session ID", async () => {
    const dir = sessionDir("test-session");
    const result = await stateInit({
      sessionId: "test-session",
      branch: "feat/test",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    expect(result).toBe("test-session");
  });

  it("persists session data in SQLite", async () => {
    const dir = sessionDir("persist-test");
    await stateInit({
      sessionId: "persist-test",
      branch: "feat/persist",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "persist-test");
    expect(result).not.toBeNull();
    expect(result?.session.id).toBe("persist-test");
    expect(result?.session.status).toBe("active");
    expect(result?.session.workflow_type).toBe("review");
    expect(result?.session.current_phase).toBe("context");
    expect(result?.session.phase_number).toBe(1);
    expect(result?.session.current_round).toBe(1);
    expect(result?.session.current_map_run).toBe(1);
  });

  it("inserts a session_created event", async () => {
    const dir = sessionDir("event-test");
    await stateInit({
      sessionId: "event-test",
      branch: "feat/events",
      workflowType: "map",
      sessionDir: dir,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "event-test");
    expect(result).not.toBeNull();
    expect(result?.events).toHaveLength(1);
    expect(result?.events[0]?.event_type).toBe("session_created");
  });

  it("creates the database file", async () => {
    const dir = sessionDir("db-create");
    await stateInit({
      sessionId: "db-create",
      branch: "main",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    expect(existsSync(join(ocrDir, "data", "ocr.db"))).toBe(true);
  });

  it("supports map workflow type", async () => {
    const dir = sessionDir("map-session");
    await stateInit({
      sessionId: "map-session",
      branch: "feat/map",
      workflowType: "map",
      sessionDir: dir,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "map-session");
    expect(result?.session.workflow_type).toBe("map");
  });
});

describe("stateTransition", () => {
  it("transitions phase in SQLite", async () => {
    const dir = sessionDir("transition-test");
    await stateInit({
      sessionId: "transition-test",
      branch: "feat/trans",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateTransition({
      sessionId: "transition-test",
      phase: "change-context",
      phaseNumber: 2,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "transition-test");
    expect(result?.session.current_phase).toBe("change-context");
    expect(result?.session.phase_number).toBe(2);
  });

  it("inserts a phase_transition event", async () => {
    const dir = sessionDir("phase-event");
    await stateInit({
      sessionId: "phase-event",
      branch: "feat/pe",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateTransition({
      sessionId: "phase-event",
      phase: "analysis",
      phaseNumber: 3,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "phase-event");
    const events = result?.events ?? [];
    const transitionEvent = events.find(
      (e) => e.event_type === "phase_transition",
    );
    expect(transitionEvent).toBeDefined();
    expect(transitionEvent?.phase).toBe("analysis");
    expect(transitionEvent?.phase_number).toBe(3);
  });

  it("inserts a round_started event when round changes", async () => {
    const dir = sessionDir("round-change");
    await stateInit({
      sessionId: "round-change",
      branch: "feat/rc",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateTransition({
      sessionId: "round-change",
      phase: "context",
      phaseNumber: 1,
      round: 2,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "round-change");
    const events = result?.events ?? [];
    const roundEvent = events.find((e) => e.event_type === "round_started");
    expect(roundEvent).toBeDefined();
    expect(roundEvent?.round).toBe(2);
  });

  it("does not insert round_started when round stays the same", async () => {
    const dir = sessionDir("no-round-event");
    await stateInit({
      sessionId: "no-round-event",
      branch: "feat/nre",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateTransition({
      sessionId: "no-round-event",
      phase: "change-context",
      phaseNumber: 2,
      round: 1, // same round
      ocrDir,
    });

    const result = await stateShow(ocrDir, "no-round-event");
    const events = result?.events ?? [];
    const roundEvent = events.find((e) => e.event_type === "round_started");
    expect(roundEvent).toBeUndefined();
  });

  it("throws if session does not exist", async () => {
    // Ensure DB exists
    const dir = sessionDir("exists-first");
    await stateInit({
      sessionId: "exists-first",
      branch: "main",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await expect(
      stateTransition({
        sessionId: "nonexistent",
        phase: "context",
        phaseNumber: 1,
        ocrDir,
      }),
    ).rejects.toThrow("Session not found: nonexistent");
  });

  it("supports multiple sequential transitions", async () => {
    const dir = sessionDir("multi-trans");
    await stateInit({
      sessionId: "multi-trans",
      branch: "feat/mt",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const phases = [
      { phase: "change-context", phaseNumber: 2 },
      { phase: "analysis", phaseNumber: 3 },
      { phase: "reviews", phaseNumber: 4 },
      { phase: "aggregation", phaseNumber: 5 },
      { phase: "discourse", phaseNumber: 6 },
      { phase: "synthesis", phaseNumber: 7 },
    ];

    for (const p of phases) {
      await stateTransition({
        sessionId: "multi-trans",
        phase: p.phase as import("../../state/types.js").ReviewPhase,
        phaseNumber: p.phaseNumber,
        ocrDir,
      });
    }

    const result = await stateShow(ocrDir, "multi-trans");
    expect(result?.session.current_phase).toBe("synthesis");
    expect(result?.session.phase_number).toBe(7);
    // 1 session_created + 6 phase_transitions = 7 events
    expect(result?.events).toHaveLength(7);
  });
});

describe("stateClose", () => {
  it("marks session as closed in SQLite", async () => {
    const dir = sessionDir("close-test");
    await stateInit({
      sessionId: "close-test",
      branch: "feat/close",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateClose({
      sessionId: "close-test",
      ocrDir,
    });

    const result = await stateShow(ocrDir, "close-test");
    expect(result?.session.status).toBe("closed");
    expect(result?.session.current_phase).toBe("complete");
  });

  it("inserts a session_closed event", async () => {
    const dir = sessionDir("close-event");
    await stateInit({
      sessionId: "close-event",
      branch: "feat/ce",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateClose({
      sessionId: "close-event",
      ocrDir,
    });

    const result = await stateShow(ocrDir, "close-event");
    const events = result?.events ?? [];
    const closeEvent = events.find((e) => e.event_type === "session_closed");
    expect(closeEvent).toBeDefined();
    expect(closeEvent?.phase).toBe("complete");
  });

  it("throws if session does not exist", async () => {
    const dir = sessionDir("close-noexist");
    await stateInit({
      sessionId: "close-noexist",
      branch: "main",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await expect(
      stateClose({
        sessionId: "ghost",
        ocrDir,
      }),
    ).rejects.toThrow("Session not found: ghost");
  });
});

describe("stateShow", () => {
  it("returns latest active session when no ID given", async () => {
    const dir1 = sessionDir("show-s1");
    const dir2 = sessionDir("show-s2");

    await stateInit({
      sessionId: "show-s1",
      branch: "feat/a",
      workflowType: "review",
      sessionDir: dir1,
      ocrDir,
    });

    await stateInit({
      sessionId: "show-s2",
      branch: "feat/b",
      workflowType: "map",
      sessionDir: dir2,
      ocrDir,
    });

    const result = await stateShow(ocrDir);
    expect(result).not.toBeNull();
    expect(result?.session.status).toBe("active");
  });

  it("returns specific session by ID", async () => {
    const dir = sessionDir("specific");
    await stateInit({
      sessionId: "specific",
      branch: "feat/spec",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "specific");
    expect(result?.session.id).toBe("specific");
  });

  it("returns null when no sessions exist", async () => {
    // Just ensure the DB exists with no sessions
    const dir = sessionDir("temp");
    await stateInit({
      sessionId: "temp",
      branch: "main",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });
    await stateClose({
      sessionId: "temp",
      ocrDir,
    });

    // No active sessions now
    const result = await stateShow(ocrDir);
    expect(result).toBeNull();
  });

  it("includes recent events in the result", async () => {
    const dir = sessionDir("events-show");
    await stateInit({
      sessionId: "events-show",
      branch: "feat/ev",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    await stateTransition({
      sessionId: "events-show",
      phase: "analysis",
      phaseNumber: 3,
      ocrDir,
    });

    const result = await stateShow(ocrDir, "events-show");
    expect(result?.events.length).toBeGreaterThanOrEqual(2);
  });
});

describe("stateList", () => {
  it("returns all sessions", async () => {
    const dir1 = sessionDir("list-1");
    const dir2 = sessionDir("list-2");

    await stateInit({
      sessionId: "list-1",
      branch: "feat/a",
      workflowType: "review",
      sessionDir: dir1,
      ocrDir,
    });
    await stateInit({
      sessionId: "list-2",
      branch: "feat/b",
      workflowType: "map",
      sessionDir: dir2,
      ocrDir,
    });

    const sessions = await stateList(ocrDir);
    expect(sessions).toHaveLength(2);
  });

  it("returns empty array when no sessions", async () => {
    const sessions = await stateList(ocrDir);
    expect(sessions).toHaveLength(0);
  });
});

describe("stateSync", () => {
  it("backfills sessions from filesystem into SQLite", async () => {
    // Create a session dir with filesystem artifacts but no SQLite row
    const dir = join(sessionsDir, "2026-03-04-feat-legacy");
    mkdirSync(join(dir, "rounds", "round-1", "reviews"), { recursive: true });

    const synced = await stateSync(ocrDir);
    expect(synced).toBe(1);

    // Verify backfilled in SQLite
    const result = await stateShow(ocrDir, "2026-03-04-feat-legacy");
    expect(result).not.toBeNull();
    expect(result?.session.branch).toBe("feat-legacy");
    expect(result?.session.workflow_type).toBe("review");
  });

  it("skips sessions that already exist in SQLite", async () => {
    const dir = sessionDir("already-exists");
    await stateInit({
      sessionId: "already-exists",
      branch: "feat/ae",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const synced = await stateSync(ocrDir);
    expect(synced).toBe(0);
  });

  it("syncs directories without review or map artifacts as review", async () => {
    const dir = join(sessionsDir, "empty-dir");
    mkdirSync(dir, { recursive: true });

    const synced = await stateSync(ocrDir);
    expect(synced).toBe(1);

    const result = await stateShow(ocrDir, "empty-dir");
    expect(result).not.toBeNull();
    expect(result?.session.workflow_type).toBe("review");
  });

  it("detects map workflow from filesystem structure", async () => {
    const dir = join(sessionsDir, "2026-03-04-feat-map-test");
    mkdirSync(join(dir, "map", "runs", "run-1"), { recursive: true });

    const synced = await stateSync(ocrDir);
    expect(synced).toBe(1);

    const result = await stateShow(ocrDir, "2026-03-04-feat-map-test");
    expect(result?.session.workflow_type).toBe("map");
  });

  it("inserts a session_synced event for backfilled sessions", async () => {
    const dir = join(sessionsDir, "synced-events");
    mkdirSync(dir, { recursive: true });

    await stateSync(ocrDir);

    const result = await stateShow(ocrDir, "synced-events");
    const syncEvent = result?.events.find(
      (e) => e.event_type === "session_synced",
    );
    expect(syncEvent).toBeDefined();
    expect(syncEvent?.metadata).toContain("filesystem_backfill");
  });

  it("syncs multiple sessions at once", async () => {
    for (let i = 1; i <= 3; i++) {
      const dir = join(sessionsDir, `multi-sync-${i}`);
      mkdirSync(dir, { recursive: true });
    }

    const synced = await stateSync(ocrDir);
    expect(synced).toBe(3);

    const sessions = await stateList(ocrDir);
    expect(sessions).toHaveLength(3);
  });

  it("returns 0 when sessions directory does not exist", async () => {
    const synced = await stateSync(ocrDir);
    expect(synced).toBe(0);
  });
});

describe("resolveActiveSession", () => {
  it("returns the latest active session", async () => {
    const dir = sessionDir("active-resolve");
    await stateInit({
      sessionId: "active-resolve",
      branch: "feat/ar",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const result = await resolveActiveSession(ocrDir);
    expect(result.id).toBe("active-resolve");
    expect(result.sessionDir).toBe(dir);
  });

  it("throws when no active session exists", async () => {
    const dir = sessionDir("closed-resolve");
    await stateInit({
      sessionId: "closed-resolve",
      branch: "feat/cr",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });
    await stateClose({
      sessionId: "closed-resolve",
      ocrDir,
    });

    await expect(resolveActiveSession(ocrDir)).rejects.toThrow(
      "No active session found",
    );
  });
});
