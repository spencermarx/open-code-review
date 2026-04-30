/**
 * Agent-session journal + team-config API end-to-end tests.
 *
 * Khorikov classical (Detroit) school:
 *   • Real built dashboard server forked as a child process
 *   • Real `.ocr/data/ocr.db` SQLite file (sql.js) on disk
 *   • Real `ocr` CLI subprocesses to mutate state (the AI's actual write path)
 *   • Real HTTP requests against the running server
 *   • No internal-module imports, no internal mocks
 *
 * Tests verify the contract the dashboard's React components depend on —
 * route shapes, status codes, and the agent_session lifecycle observable
 * across the CLI/server boundary.
 */

import { execFile, spawn } from "node:child_process";
import { resolve } from "node:path";
import { writeFileSync, existsSync } from "node:fs";
import { promisify } from "node:util";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, type ServerInstance } from "./helpers/server-harness.js";

const execFileAsync = promisify(execFile);

const CLI_BIN = resolve(
  import.meta.dirname,
  "../../../packages/cli/dist/index.js",
);

if (!existsSync(CLI_BIN)) {
  throw new Error(`CLI binary not found at ${CLI_BIN}. Run "pnpm nx build cli" first.`);
}

let server: ServerInstance;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server?.cleanup();
});

function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${server.token}`,
      ...opts?.headers,
    },
  });
}

/** Run the OCR CLI inside the test server's project directory. */
async function runCli(args: string[], stdin?: string): Promise<string> {
  const projectDir = resolve(server.ocrDir, "..");
  if (stdin !== undefined) {
    return new Promise<string>((res, rej) => {
      const child = spawn("node", [CLI_BIN, ...args], {
        cwd: projectDir,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c: Buffer) => {
        stdout += c.toString();
      });
      child.stderr?.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      child.on("close", (code) => {
        if (code === 0) res(stdout.trim());
        else rej(new Error(`ocr ${args.join(" ")} exited ${code}: ${stderr}`));
      });
      child.stdin?.write(stdin);
      child.stdin?.end();
    });
  }
  const { stdout } = await execFileAsync("node", [CLI_BIN, ...args], {
    cwd: projectDir,
    env: { ...process.env, NO_COLOR: "1" },
    timeout: 15_000,
  });
  return stdout.trim();
}

async function seedWorkflow(id: string, branch: string): Promise<string> {
  return runCli([
    "state",
    "init",
    "--session-id",
    id,
    "--branch",
    branch,
    "--workflow-type",
    "review",
  ]);
}

async function seedAgentSession(
  workflowId: string,
  persona: string,
  instance: number,
  vendor = "claude",
  model?: string,
): Promise<string> {
  const args = [
    "session",
    "start-instance",
    "--workflow",
    workflowId,
    "--persona",
    persona,
    "--instance",
    String(instance),
    "--vendor",
    vendor,
  ];
  if (model) args.push("--model", model);
  return runCli(args);
}

/**
 * Poll the dashboard until the workflow has the expected agent session
 * count, or fall through after a generous timeout. The dashboard's
 * `DbSyncWatcher` is debounced and stability-thresholded, so absolute
 * sleeps are flaky; polling against the observable contract is the
 * Detroit-school move.
 */
async function waitForAgentSessionCount(
  workflowId: string,
  expected: number,
  timeoutMs = 8_000,
): Promise<unknown[]> {
  const start = Date.now();
  let last: unknown[] = [];
  while (Date.now() - start < timeoutMs) {
    const res = await apiFetch(
      `/api/agent-sessions?workflow=${encodeURIComponent(workflowId)}`,
    );
    if (res.status === 200) {
      const body = (await res.json()) as { agent_sessions: unknown[] };
      last = body.agent_sessions;
      if (last.length === expected) return last;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return last;
}

/**
 * Poll until `getSession` for the given workflow returns 200 (the
 * `sessions` table has synced from disk to the dashboard's in-memory db).
 */
async function waitForWorkflowVisible(
  workflowId: string,
  timeoutMs = 8_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(workflowId)}`,
    );
    if (res.status === 200) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Workflow ${workflowId} not visible after ${timeoutMs}ms`);
}

/** Poll until the most recent agent session has the expected vendor_session_id. */
async function waitForVendorBound(
  workflowId: string,
  expectedVendorId: string,
  timeoutMs = 8_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiFetch(
      `/api/agent-sessions?workflow=${encodeURIComponent(workflowId)}`,
    );
    if (res.status === 200) {
      const body = (await res.json()) as {
        agent_sessions: Array<{ vendor_session_id: string | null }>;
      };
      if (body.agent_sessions.some((r) => r.vendor_session_id === expectedVendorId)) {
        return;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Vendor id ${expectedVendorId} not bound after ${timeoutMs}ms`);
}

describe("GET /api/agent-sessions", () => {
  it("returns 400 without ?workflow=", async () => {
    const res = await apiFetch("/api/agent-sessions");
    expect(res.status).toBe(400);
  });

  it("returns an empty array when the workflow has no agent_sessions", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-empty",
      "feat/empty",
    );

    // The endpoint pulls fresh state from disk on every read, so the CLI's
    // workflow row is visible without a separate wait. The test verifies
    // the empty-array contract — the workflow exists, no agent_sessions yet.
    const res = await apiFetch(
      `/api/agent-sessions?workflow=${encodeURIComponent(workflowId)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workflow_id: string; agent_sessions: unknown[] };
    expect(body.workflow_id).toBe(workflowId);
    expect(body.agent_sessions).toEqual([]);
  });

  it("returns rows the CLI inserted, with their lifecycle fields visible", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-list",
      "feat/list",
    );
    const agentId = await seedAgentSession(workflowId, "principal", 1, "claude", "claude-opus-4-7");

    const rows = (await waitForAgentSessionCount(workflowId, 1)) as Array<{
      id: string;
      persona: string | null;
      resolved_model: string | null;
      status: string;
      last_heartbeat_at: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: agentId,
      persona: "principal",
      resolved_model: "claude-opus-4-7",
      status: "running",
    });
    expect(rows[0]?.last_heartbeat_at).toBeTruthy();
  });
});

describe("GET /api/sessions/:id/handoff", () => {
  it("returns 404 for a non-existent workflow", async () => {
    const res = await apiFetch("/api/sessions/does-not-exist/handoff");
    expect(res.status).toBe(404);
  });

  it("returns the fresh-start fallback when no vendor session id is captured", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-fallback",
      "feat/fallback",
    );
    // Insert an agent session BUT don't bind a vendor id
    await seedAgentSession(workflowId, "principal", 1);

    await waitForAgentSessionCount(workflowId, 1);
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(workflowId)}/handoff`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      workflow_id: string;
      vendor_session_id: string | null;
      ocr_command: string;
      vendor_command: string | null;
      fallback: string | null;
      project_dir: string;
    };
    expect(body.workflow_id).toBe(workflowId);
    expect(body.vendor_session_id).toBeNull();
    expect(body.fallback).toBe("fresh-start");
    expect(body.vendor_command).toBeNull();
    expect(body.ocr_command).toContain("cd ");
    expect(body.ocr_command).toContain("ocr review --branch feat/fallback");
    expect(body.project_dir).toBe(resolve(server.ocrDir, ".."));
  });

  it("returns OCR-mediated and vendor-native command pairs after binding", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-bound",
      "feat/bound",
    );
    const agentId = await seedAgentSession(workflowId, "principal", 1, "claude");
    await runCli(["session", "bind-vendor-id", agentId, "vendor-session-xyz-789"]);

    // Wait until the bound vendor id appears in the dashboard's view
    await waitForAgentSessionCount(workflowId, 1);
    await waitForVendorBound(workflowId, "vendor-session-xyz-789");
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(workflowId)}/handoff`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vendor: string;
      vendor_session_id: string;
      ocr_command: string;
      vendor_command: string;
      fallback: string | null;
      host_binary_available: boolean;
    };
    expect(body.vendor).toBe("claude");
    expect(body.vendor_session_id).toBe("vendor-session-xyz-789");
    expect(body.fallback).toBeNull();
    // OCR-mediated command resumes via OCR's CLI using the WORKFLOW id
    expect(body.ocr_command).toContain(`ocr review --resume ${workflowId}`);
    // Vendor-native command bypasses OCR using the VENDOR id
    expect(body.vendor_command).toContain("vendor-session-xyz-789");
    expect(body.vendor_command).toContain("claude --resume");
    expect(typeof body.host_binary_available).toBe("boolean");
  });

  it("constructs the correct vendor command for OpenCode", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-opencode",
      "feat/opencode",
    );
    const agentId = await seedAgentSession(workflowId, "quality", 1, "opencode");
    await runCli(["session", "bind-vendor-id", agentId, "oc-vendor-456"]);

    await waitForAgentSessionCount(workflowId, 1);
    await waitForVendorBound(workflowId, "oc-vendor-456");
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(workflowId)}/handoff`,
    );
    const body = (await res.json()) as { vendor_command: string };
    expect(body.vendor_command).toContain("opencode run");
    expect(body.vendor_command).toContain("--session oc-vendor-456");
    expect(body.vendor_command).toContain("--continue");
  });
});

describe("GET /api/team/resolved", () => {
  it("returns the team parsed from disk config", async () => {
    writeFileSync(
      resolve(server.ocrDir, "config.yaml"),
      `default_team:\n  principal: { count: 2, model: claude-opus-4-7 }\n  quality: 1\n`,
    );

    const res = await apiFetch("/api/team/resolved");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      team: Array<{ persona: string; instance_index: number; model: string | null }>;
    };
    expect(body.team).toHaveLength(3);
    const principals = body.team.filter((t) => t.persona === "principal");
    expect(principals).toHaveLength(2);
    expect(principals.every((p) => p.model === "claude-opus-4-7")).toBe(true);
    expect(body.team.find((t) => t.persona === "quality")?.model).toBeNull();
  });

  it("applies an ?override=<json> param without mutating disk config", async () => {
    writeFileSync(
      resolve(server.ocrDir, "config.yaml"),
      `default_team:\n  principal: 2\n  quality: 1\n`,
    );

    const override = JSON.stringify([
      {
        persona: "principal",
        instance_index: 1,
        name: "principal-1",
        model: "claude-haiku-4-5-20251001",
      },
    ]);

    const res = await apiFetch(
      `/api/team/resolved?override=${encodeURIComponent(override)}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      team: Array<{ persona: string; model: string | null }>;
    };
    // principal personas were overridden — only one instance, with a different model
    const principals = body.team.filter((t) => t.persona === "principal");
    expect(principals).toHaveLength(1);
    expect(principals[0]?.model).toBe("claude-haiku-4-5-20251001");
    // quality is untouched
    expect(body.team.filter((t) => t.persona === "quality")).toHaveLength(1);

    // Verify disk config wasn't rewritten by re-reading without override
    const second = await apiFetch("/api/team/resolved");
    const secondBody = (await second.json()) as {
      team: Array<{ persona: string }>;
    };
    expect(secondBody.team.filter((t) => t.persona === "principal")).toHaveLength(2);
  });

  it("rejects malformed override JSON with a 400", async () => {
    writeFileSync(
      resolve(server.ocrDir, "config.yaml"),
      `default_team:\n  principal: 1\n`,
    );

    const res = await apiFetch(
      "/api/team/resolved?override=" + encodeURIComponent("not-json"),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/team/models", () => {
  it("returns models for a vendor passed via ?vendor=", async () => {
    const res = await apiFetch("/api/team/models?vendor=claude");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      vendor: string | null;
      source: string | null;
      models: Array<{ id: string }>;
    };
    expect(body.vendor).toBe("claude");
    expect(["native", "bundled"]).toContain(body.source ?? "");
    expect(body.models.length).toBeGreaterThan(0);
    for (const m of body.models) {
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown vendor with 400", async () => {
    const res = await apiFetch("/api/team/models?vendor=nonexistent");
    expect(res.status).toBe(400);
  });
});

describe("agent_sessions cross-process visibility", () => {
  it("CLI writes are visible to the dashboard via DbSyncWatcher", async () => {
    const workflowId = await seedWorkflow(
      "2026-04-29-sync",
      "feat/sync",
    );

    // CLI writes a row — dashboard should see it on the next sync
    const agentId = await seedAgentSession(workflowId, "principal", 1, "claude");

    const rowsAfterInsert = (await waitForAgentSessionCount(workflowId, 1)) as Array<{
      id: string;
      status: string;
    }>;
    expect(rowsAfterInsert).toHaveLength(1);
    expect(rowsAfterInsert[0]?.id).toBe(agentId);

    // Status transition is also visible after sync
    await runCli(["session", "end-instance", agentId, "--exit-code", "0"]);

    // Poll until status flips to 'done' (heartbeat-only changes also flow
    // through the syncer; we're really watching status here).
    const start = Date.now();
    let finalStatus = "running";
    while (Date.now() - start < 8_000) {
      const res = await apiFetch(
        `/api/agent-sessions?workflow=${encodeURIComponent(workflowId)}`,
      );
      const body = (await res.json()) as {
        agent_sessions: Array<{ status: string }>;
      };
      finalStatus = body.agent_sessions[0]?.status ?? "running";
      if (finalStatus === "done") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    expect(finalStatus).toBe("done");
  });
});
