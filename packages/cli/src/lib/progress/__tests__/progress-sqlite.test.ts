/**
 * Tests for progress command SQLite integration.
 *
 * Verifies that progress strategies read from SQLite as primary source
 * and handle the waiting state correctly.
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { closeAllDatabases, openDatabase } from "../../db/index.js";
import {
  stateInit,
  stateTransition,
} from "../../state/index.js";
import { setProgressDb } from "../session-reader.js";
import { reviewStrategy } from "../review-strategy.js";
import { mapStrategy } from "../map-strategy.js";
import { readSessionState } from "../session-reader.js";

let tmpDir: string;
let ocrDir: string;
let sessionsDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ocr-progress-test-"));
  ocrDir = join(tmpDir, ".ocr");
  sessionsDir = join(ocrDir, "sessions");
  // Reset progress DB cache
  setProgressDb(null);
});

afterEach(() => {
  setProgressDb(null);
  closeAllDatabases();
  rmSync(tmpDir, { recursive: true, force: true });
});

function createSessionDir(sessionId: string): string {
  const dir = join(sessionsDir, sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function initDbAndSession(
  sessionId: string,
  workflowType: "review" | "map",
  phase = "context",
  phaseNumber = 1,
): Promise<string> {
  const dir = createSessionDir(sessionId);
  await stateInit({
    sessionId,
    branch: "feat/test",
    workflowType,
    sessionDir: dir,
    ocrDir,
  });

  if (phase !== "context" || phaseNumber !== 1) {
    await stateTransition({
      sessionId,
      phase: phase as import("../../state/types.js").ReviewPhase | import("../../state/types.js").MapPhase,
      phaseNumber,
      ocrDir,
    });
  }

  // Set up the progress DB cache
  const dbPath = join(ocrDir, "data", "ocr.db");
  const db = await openDatabase(dbPath);
  setProgressDb(db);

  return dir;
}

describe("SQLite as primary read source", () => {
  it("review strategy reads phase from SQLite", async () => {
    const dir = await initDbAndSession("sqlite-review", "review", "analysis", 3);

    const state = reviewStrategy.parseState(dir, undefined, ocrDir);
    expect(state).not.toBeNull();
    expect(state?.phase).toBe("analysis");
    expect(state?.phaseNumber).toBe(3);
    expect(state?.workflowType).toBe("review");
  });

  it("map strategy reads phase from SQLite", async () => {
    const dir = await initDbAndSession("sqlite-map", "map", "topology", 2);

    const state = mapStrategy.parseState(dir, undefined, ocrDir);
    expect(state).not.toBeNull();
    expect(state?.phase).toBe("topology");
    expect(state?.phaseNumber).toBe(2);
    expect(state?.workflowType).toBe("map");
  });

  it("review strategy reads current_round from SQLite", async () => {
    const dir = createSessionDir("round-test");
    await stateInit({
      sessionId: "round-test",
      branch: "feat/round",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });
    await stateTransition({
      sessionId: "round-test",
      phase: "context",
      phaseNumber: 1,
      round: 2,
      ocrDir,
    });

    // Create filesystem round directories so the strategy can see round 2
    mkdirSync(join(dir, "rounds", "round-1", "reviews"), { recursive: true });
    mkdirSync(join(dir, "rounds", "round-2", "reviews"), { recursive: true });

    const dbPath = join(ocrDir, "data", "ocr.db");
    const db = await openDatabase(dbPath);
    setProgressDb(db);

    const state = reviewStrategy.parseState(dir, undefined, ocrDir);
    expect(state).not.toBeNull();
    if (state?.workflowType === "review") {
      expect(state.currentRound).toBe(2);
    }
  });

  it("readSessionState returns data from SQLite", async () => {
    const dir = await initDbAndSession("read-sqlite", "review", "reviews", 4);

    const state = readSessionState(dir, ocrDir);
    expect(state).not.toBeNull();
    expect(state?.current_phase).toBe("reviews");
    expect(state?.phase_number).toBe(4);
  });

  it("preserves startTime across re-parses", async () => {
    const dir = await initDbAndSession("start-time", "review");

    const state1 = reviewStrategy.parseState(dir, undefined, ocrDir);
    expect(state1).not.toBeNull();

    // Re-parse with preserved start time
    const state2 = reviewStrategy.parseState(dir, state1?.startTime, ocrDir);
    expect(state2).not.toBeNull();
    expect(state2?.startTime).toBe(state1?.startTime);
  });
});

describe("Waiting state", () => {
  it("returns null when no state data exists at all", () => {
    const dir = createSessionDir("no-state");

    // No SQLite data — should return null
    const reviewState = reviewStrategy.parseState(dir);
    expect(reviewState).toBeNull();

    const mapState = mapStrategy.parseState(dir);
    expect(mapState).toBeNull();
  });

  it("readSessionState returns null when no sources available", () => {
    const dir = createSessionDir("nothing");
    const result = readSessionState(dir);
    expect(result).toBeNull();
  });

  it("readSessionState returns null when ocrDir has no DB", () => {
    const dir = createSessionDir("no-db");
    const result = readSessionState(dir, ocrDir);
    expect(result).toBeNull();
  });

  it("SQLite session with status=closed is still readable", async () => {
    const dir = createSessionDir("closed-session");
    await stateInit({
      sessionId: "closed-session",
      branch: "feat/closed",
      workflowType: "review",
      sessionDir: dir,
      ocrDir,
    });

    const { stateClose } = await import("../../state/index.js");
    await stateClose({
      sessionId: "closed-session",
      ocrDir,
    });

    const dbPath = join(ocrDir, "data", "ocr.db");
    const db = await openDatabase(dbPath);
    setProgressDb(db);

    // The closed session should still be readable by exact ID match
    const state = reviewStrategy.parseState(dir, undefined, ocrDir);
    expect(state).not.toBeNull();
    expect(state?.phase).toBe("complete");
    expect(state?.complete).toBe(true);
  });
});
