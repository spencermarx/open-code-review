import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { dashboardCommand, resolveServerPath } from "../dashboard.js";
import { closeAllDatabases } from "../../lib/db/index.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "ocr-dashboard-test-"));
});

afterEach(() => {
  closeAllDatabases();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/**
 * Helper: sets up a valid .ocr directory so requireOcrSetup passes.
 */
function setupOcr(): string {
  const ocrDir = join(tmpDir, ".ocr");
  mkdirSync(join(ocrDir, "skills"), { recursive: true });
  return ocrDir;
}

/**
 * Helper: runs the dashboard command action, capturing process.exit
 * and console output.
 */
async function runDashboard(
  args: string[] = [],
): Promise<{
  exitCode: number | null;
  errorOutput: string;
  logOutput: string;
}> {
  let exitCode: number | null = null;

  vi.spyOn(process, "exit").mockImplementation(((code: number) => {
    exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  }) as never);

  const errorLines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((...msgs: unknown[]) => {
    errorLines.push(msgs.map(String).join(" "));
  });

  const logLines: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...msgs: unknown[]) => {
    logLines.push(msgs.map(String).join(" "));
  });

  const originalCwd = process.cwd;
  process.cwd = () => tmpDir;

  try {
    // Use "node" as argv[0] and "dashboard" as argv[1] so Commander
    // skips the first two elements (from: "node" mode, the default).
    await dashboardCommand.parseAsync(
      ["node", "dashboard", ...args],
    );
  } catch {
    // Expected — process.exit throws
  }

  process.cwd = originalCwd;

  return {
    exitCode,
    errorOutput: errorLines.join("\n"),
    logOutput: logLines.join("\n"),
  };
}

describe("dashboardCommand (Task 18)", () => {
  describe("18.1 — command registration", () => {
    it("has the correct name", () => {
      expect(dashboardCommand.name()).toBe("dashboard");
    });

    it("has a description", () => {
      expect(dashboardCommand.description()).toBeTruthy();
    });

    it("has --port option with default 4173", () => {
      const portOption = dashboardCommand.options.find(
        (o) => o.long === "--port",
      );
      expect(portOption).toBeDefined();
      expect(portOption!.defaultValue).toBe("4173");
    });

    it("has --no-open option", () => {
      const openOption = dashboardCommand.options.find(
        (o) => o.long === "--no-open",
      );
      expect(openOption).toBeDefined();
    });

    it("has -p as short alias for --port", () => {
      const portOption = dashboardCommand.options.find(
        (o) => o.long === "--port",
      );
      expect(portOption).toBeDefined();
      expect(portOption!.short).toBe("-p");
    });
  });

  describe("18.2 — OCR setup validation", () => {
    it("exits with code 1 when .ocr directory is missing", async () => {
      const result = await runDashboard();
      expect(result.exitCode).toBe(1);
    });

    it("exits when .ocr exists but skills/ is missing", async () => {
      mkdirSync(join(tmpDir, ".ocr"), { recursive: true });
      const result = await runDashboard();
      expect(result.exitCode).toBe(1);
    });
  });

  describe("18.2 — database auto-creation", () => {
    it("creates .ocr/data/ocr.db when it does not exist", async () => {
      setupOcr();

      // The command will create the DB, then fail on missing server.js
      const result = await runDashboard();

      const dbPath = join(tmpDir, ".ocr", "data", "ocr.db");
      expect(existsSync(dbPath)).toBe(true);

      // Error should be about the server bundle, not the database
      expect(result.errorOutput).toContain("Dashboard server bundle not found");
    });

    it("creates .ocr/data/ directory if it does not exist", async () => {
      setupOcr();
      const dataDir = join(tmpDir, ".ocr", "data");
      expect(existsSync(dataDir)).toBe(false);

      await runDashboard();

      expect(existsSync(dataDir)).toBe(true);
    });

    it("does not fail when .ocr/data/ocr.db already exists", async () => {
      const ocrDir = setupOcr();

      // Pre-create the DB with migrations
      const { ensureDatabase } = await import("../../lib/db/index.js");
      await ensureDatabase(ocrDir);
      closeAllDatabases();

      const dbPath = join(ocrDir, "data", "ocr.db");
      expect(existsSync(dbPath)).toBe(true);

      // Run dashboard — should pass DB creation and fail on server.js
      const result = await runDashboard();

      expect(result.errorOutput).toContain("Dashboard server bundle not found");
      expect(result.errorOutput).not.toContain("Failed to initialize database");
    });

    it("creates database with proper schema (sessions table exists)", async () => {
      const ocrDir = setupOcr();

      await runDashboard();

      // Re-open the created database and check schema
      const { openDatabase } = await import("../../lib/db/index.js");
      const dbPath = join(ocrDir, "data", "ocr.db");
      const db = await openDatabase(dbPath);

      const tables = db.exec(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      );

      const tableNames = tables[0]?.values.map((row) => row[0]) ?? [];
      expect(tableNames).toContain("sessions");
      expect(tableNames).toContain("orchestration_events");
      expect(tableNames).toContain("schema_version");
    });
  });

  describe("18.1 — port validation", () => {
    it("rejects non-numeric port values", async () => {
      setupOcr();
      const result = await runDashboard(["--port", "abc"]);
      expect(result.exitCode).toBe(1);
      expect(result.errorOutput).toContain("Invalid port");
    });

    it("rejects port 0", async () => {
      setupOcr();
      const result = await runDashboard(["--port", "0"]);
      expect(result.exitCode).toBe(1);
      expect(result.errorOutput).toContain("Invalid port");
    });

    it("rejects port above 65535", async () => {
      setupOcr();
      const result = await runDashboard(["--port", "99999"]);
      expect(result.exitCode).toBe(1);
      expect(result.errorOutput).toContain("Invalid port");
    });
  });

  describe("18.3 — server path resolution", () => {
    it("resolveServerPath returns a path ending in dashboard/server.js", () => {
      const p = resolveServerPath();
      expect(p).toMatch(/dashboard[/\\]server\.js$/);
    });

    it("exits when dashboard server bundle is not found", async () => {
      setupOcr();
      const result = await runDashboard();

      expect(result.exitCode).toBe(1);
      expect(result.errorOutput).toContain("Dashboard server bundle not found");
    });
  });
});
