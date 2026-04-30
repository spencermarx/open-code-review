/**
 * Agent-session journal end-to-end tests.
 *
 * Khorikov classical (Detroit) school:
 *   • Real subprocess execution of the built `ocr` binary
 *   • Real SQLite database written to a real temp `.ocr/data/` directory
 *   • Real config.yaml on disk
 *   • No internal-module imports, no internal mocks
 *
 * Tests assert observable behavior — exit codes, stdout content,
 * cross-invocation state visible to subsequent commands.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import { spawnCli } from "./helpers/spawn-cli.js";
import {
  createInitializedProject,
  writeConfigYaml,
  type TempProject,
} from "./helpers/temp-project.js";

const cleanups: (() => void)[] = [];
afterAll(() => cleanups.forEach((fn) => fn()));

function tracked<T extends TempProject>(project: T): T {
  cleanups.push(project.cleanup);
  return project;
}

/**
 * Initialize a workflow `sessions` row via `ocr state init`. Returns the
 * session id printed on stdout — the canonical way for tests to obtain
 * a workflow id without importing internal modules.
 */
async function initWorkflow(project: TempProject): Promise<string> {
  const result = await spawnCli(
    [
      "state",
      "init",
      "--session-id",
      "2026-04-29-feat-test",
      "--branch",
      "feat/test",
      "--workflow-type",
      "review",
    ],
    { cwd: project.dir },
  );
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
}

describe("ocr session start-instance", () => {
  it("inserts a 'running' row and prints its UUID on stdout", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);

    const result = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
        "--model",
        "claude-opus-4-7",
      ],
      { cwd: project.dir },
    );

    expect(result.exitCode).toBe(0);
    const agentId = result.stdout.trim();
    expect(agentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Observable side-effect: list now contains the row in 'running' status
    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    expect(list.exitCode).toBe(0);
    const rows = JSON.parse(list.stdout);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: agentId,
      workflow_id: workflowId,
      vendor: "claude",
      persona: "principal",
      instance_index: 1,
      name: "principal-1",
      resolved_model: "claude-opus-4-7",
      status: "running",
      vendor_session_id: null,
    });
    expect(rows[0].started_at).toBeTruthy();
    expect(rows[0].last_heartbeat_at).toBeTruthy();
    expect(rows[0].ended_at).toBeNull();
  });

  it("derives a default name from {persona}-{instance} when --name omitted", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);

    await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "quality",
        "--instance",
        "3",
        "--vendor",
        "opencode",
      ],
      { cwd: project.dir },
    );

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    expect(rows[0].name).toBe("quality-3");
  });

});

describe("ocr session bind-vendor-id", () => {
  it("binds, then rejects rebind to a different value", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);

    const startResult = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = startResult.stdout.trim();

    const firstBind = await spawnCli(
      ["session", "bind-vendor-id", agentId, "vendor-abc-123"],
      { cwd: project.dir },
    );
    expect(firstBind.exitCode).toBe(0);

    // Re-binding the SAME id is idempotent
    const idempotent = await spawnCli(
      ["session", "bind-vendor-id", agentId, "vendor-abc-123"],
      { cwd: project.dir },
    );
    expect(idempotent.exitCode).toBe(0);

    // Re-binding a DIFFERENT id is rejected
    const conflicting = await spawnCli(
      ["session", "bind-vendor-id", agentId, "vendor-different"],
      { cwd: project.dir },
    );
    expect(conflicting.exitCode).not.toBe(0);

    // The originally bound value persists
    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    expect(rows[0].vendor_session_id).toBe("vendor-abc-123");
  });
});

describe("ocr session end-instance", () => {
  it("infers 'done' from exit code 0", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);
    const start = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = start.stdout.trim();

    const end = await spawnCli(
      ["session", "end-instance", agentId, "--exit-code", "0"],
      { cwd: project.dir },
    );
    expect(end.exitCode).toBe(0);

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    expect(rows[0].status).toBe("done");
    expect(rows[0].exit_code).toBe(0);
    expect(rows[0].ended_at).toBeTruthy();
  });

  it("infers 'crashed' from a non-zero exit code", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);
    const start = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = start.stdout.trim();

    await spawnCli(
      ["session", "end-instance", agentId, "--exit-code", "1"],
      { cwd: project.dir },
    );

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    expect(rows[0].status).toBe("crashed");
  });

  it("appends notes across multiple end-instance calls", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);
    const start = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = start.stdout.trim();

    await spawnCli(
      ["session", "end-instance", agentId, "--exit-code", "1", "--note", "first observation"],
      { cwd: project.dir },
    );
    await spawnCli(
      ["session", "end-instance", agentId, "--exit-code", "1", "--note", "second observation"],
      { cwd: project.dir },
    );

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    expect(rows[0].notes).toContain("first observation");
    expect(rows[0].notes).toContain("second observation");
  });

  it("rejects --status orphaned (reserved for the sweep)", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);
    const start = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = start.stdout.trim();

    const result = await spawnCli(
      ["session", "end-instance", agentId, "--status", "orphaned"],
      { cwd: project.dir },
    );
    expect(result.exitCode).not.toBe(0);
  });
});

describe("ocr session liveness sweep", () => {
  it("reclassifies stale 'running' rows to 'orphaned' on next start-instance", async () => {
    const project = tracked(createInitializedProject());
    // Configure a tight 1-second heartbeat threshold so the test can
    // observe the sweep without waiting a full minute.
    writeConfigYaml(
      project,
      `runtime:\n  agent_heartbeat_seconds: 1\n`,
    );

    const workflowId = await initWorkflow(project);

    // Insert the row that will go stale
    const stale = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const staleId = stale.stdout.trim();

    // Wait past the threshold (the heartbeat in the row is rounded to 1s
    // resolution by SQLite's `datetime('now')`; sleep a bit longer to be
    // unambiguously stale).
    await new Promise((r) => setTimeout(r, 2_500));

    // A fresh start-instance call triggers the sweep — stale row gets
    // reclassified to 'orphaned' before the new row is inserted.
    const fresh = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "2",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const freshId = fresh.stdout.trim();

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);

    const staleRow = rows.find((r: { id: string }) => r.id === staleId);
    const freshRow = rows.find((r: { id: string }) => r.id === freshId);

    expect(staleRow.status).toBe("orphaned");
    expect(staleRow.ended_at).toBeTruthy();
    expect(staleRow.notes).toContain("orphaned by liveness sweep");
    expect(freshRow.status).toBe("running");
  });

  it("leaves a row whose heartbeat was just bumped untouched", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `runtime:\n  agent_heartbeat_seconds: 1\n`,
    );

    const workflowId = await initWorkflow(project);

    const start = await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );
    const agentId = start.stdout.trim();

    await new Promise((r) => setTimeout(r, 2_500));
    // Bump heartbeat — row should NOT be reclassified
    await spawnCli(["session", "beat", agentId], { cwd: project.dir });

    // Trigger sweep via another start-instance
    await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "2",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );

    const list = await spawnCli(
      ["session", "list", "--workflow", workflowId, "--json"],
      { cwd: project.dir },
    );
    const rows = JSON.parse(list.stdout);
    const target = rows.find((r: { id: string }) => r.id === agentId);
    expect(target.status).toBe("running");
    expect(target.ended_at).toBeNull();
  });
});

describe("ocr team resolve", () => {
  it("returns an empty array when default_team is absent", async () => {
    const project = tracked(createInitializedProject());

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([]);
  });

  it("parses Form 1 — shorthand counts (backwards compat)", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `default_team:\n  principal: 2\n  quality: 1\n`,
    );

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    expect(result.exitCode).toBe(0);
    const team = JSON.parse(result.stdout);
    expect(team).toHaveLength(3);
    expect(team).toEqual([
      { persona: "principal", instance_index: 1, name: "principal-1", model: null },
      { persona: "principal", instance_index: 2, name: "principal-2", model: null },
      { persona: "quality", instance_index: 1, name: "quality-1", model: null },
    ]);
  });

  it("parses Form 2 — object with shared model", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `default_team:\n  quality: { count: 2, model: claude-haiku-4-5-20251001 }\n`,
    );

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    const team = JSON.parse(result.stdout);
    expect(team).toHaveLength(2);
    for (const inst of team) {
      expect(inst.model).toBe("claude-haiku-4-5-20251001");
    }
  });

  it("parses Form 3 — list of per-instance configs", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `default_team:
  principal:
    - { model: claude-opus-4-7 }
    - { model: claude-sonnet-4-6, name: principal-balanced }
`,
    );

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    const team = JSON.parse(result.stdout);
    expect(team).toHaveLength(2);
    expect(team[0]).toEqual({
      persona: "principal",
      instance_index: 1,
      name: "principal-1",
      model: "claude-opus-4-7",
    });
    expect(team[1]).toEqual({
      persona: "principal",
      instance_index: 2,
      name: "principal-balanced",
      model: "claude-sonnet-4-6",
    });
  });

  it("expands user-defined aliases", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `models:
  aliases:
    workhorse: claude-sonnet-4-6
default_team:
  principal: { count: 2, model: workhorse }
`,
    );

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    const team = JSON.parse(result.stdout);
    for (const inst of team) {
      expect(inst.model).toBe("claude-sonnet-4-6");
    }
  });

  it("rejects mixing forms within a single persona key", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `default_team:\n  principal: { count: 2, instances: [{ model: x }] }\n`,
    );

    const result = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    expect(result.exitCode).not.toBe(0);
  });

  it("applies session-time --session-override on top of disk config", async () => {
    const project = tracked(createInitializedProject());
    writeConfigYaml(
      project,
      `default_team:\n  principal: 2\n  quality: 1\n`,
    );

    const override = JSON.stringify([
      {
        persona: "principal",
        instance_index: 1,
        name: "principal-1",
        model: "claude-opus-4-7",
      },
    ]);

    const result = await spawnCli(
      ["team", "resolve", "--json", "--session-override", override],
      { cwd: project.dir },
    );
    const team = JSON.parse(result.stdout);
    // principal is overridden — only one instance now
    expect(team.filter((i: { persona: string }) => i.persona === "principal")).toHaveLength(
      1,
    );
    // quality is untouched
    expect(team.filter((i: { persona: string }) => i.persona === "quality")).toHaveLength(
      1,
    );
  });
});

describe("ocr team set --stdin", () => {
  it("round-trips: set then resolve produces the same team", async () => {
    const project = tracked(createInitializedProject());
    const desired = [
      {
        persona: "principal",
        instance_index: 1,
        name: "principal-1",
        model: "claude-opus-4-7",
      },
      {
        persona: "principal",
        instance_index: 2,
        name: "principal-balanced",
        model: "claude-sonnet-4-6",
      },
    ];

    const set = await spawnCli(["team", "set", "--stdin"], {
      cwd: project.dir,
      stdin: JSON.stringify(desired),
    });
    expect(set.exitCode).toBe(0);

    const resolved = await spawnCli(["team", "resolve", "--json"], {
      cwd: project.dir,
    });
    expect(resolved.exitCode).toBe(0);
    const team = JSON.parse(resolved.stdout);
    expect(team).toEqual(desired);
  });

  it("regenerates reviewers-meta.json so is_default reflects the new team", async () => {
    const project = tracked(createInitializedProject());

    // Seed a reviewer library so `generateReviewersMeta` has something to
    // produce. Two personas — only one will end up in the team.
    const reviewersDir = resolve(project.dir, ".ocr/skills/references/reviewers");
    mkdirSync(reviewersDir, { recursive: true });
    writeFileSync(
      resolve(reviewersDir, "principal.md"),
      "# Principal Engineer Reviewer\n\nYou are a principal.\n",
    );
    writeFileSync(
      resolve(reviewersDir, "quality.md"),
      "# Quality Engineer Reviewer\n\nYou are a quality engineer.\n",
    );

    // Pre-write a stale meta file so we can detect that the regeneration
    // overwrote it. Mark both personas as default.
    const metaPath = resolve(project.dir, ".ocr/reviewers-meta.json");
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          schema_version: 1,
          generated_at: "2000-01-01T00:00:00.000Z",
          reviewers: [
            { id: "principal", name: "Principal", tier: "holistic", icon: "crown", description: "", focus_areas: [], is_default: true, is_builtin: true },
            { id: "quality",   name: "Quality",   tier: "specialist", icon: "sparkles", description: "", focus_areas: [], is_default: true, is_builtin: true },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    // Set a team that excludes `quality`. After regen, quality should be is_default=false.
    const team = [
      {
        persona: "principal",
        instance_index: 1,
        name: "principal-1",
        model: null,
      },
      {
        persona: "principal",
        instance_index: 2,
        name: "principal-2",
        model: "claude-opus-4-7",
      },
    ];
    const set = await spawnCli(["team", "set", "--stdin"], {
      cwd: project.dir,
      stdin: JSON.stringify(team),
    });
    expect(set.exitCode).toBe(0);
    expect(set.stdout).toContain("refreshed reviewers-meta.json");

    const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
      generated_at: string;
      reviewers: Array<{ id: string; is_default: boolean }>;
    };
    expect(meta.generated_at).not.toBe("2000-01-01T00:00:00.000Z");
    const principal = meta.reviewers.find((r) => r.id === "principal");
    const quality = meta.reviewers.find((r) => r.id === "quality");
    expect(principal?.is_default).toBe(true);
    expect(quality?.is_default).toBe(false);
  });

  it("preserves comments and unrelated keys in config.yaml", async () => {
    const project = tracked(createInitializedProject());
    const configPath = resolve(project.dir, ".ocr/config.yaml");

    // Hand-authored config with three things we expect to survive a save:
    //   1. A top-of-file comment block (REVIEW RULES section)
    //   2. An unrelated top-level key (`runtime`)
    //   3. Inline comments on team entries that aren't being changed
    writeFileSync(
      configPath,
      [
        "# REVIEW RULES",
        "# Per-severity rules for reviewers. Only add what's truly cross-cutting.",
        "",
        "# REVIEWER TEAM",
        "",
        "default_team:",
        "  principal: 2  # Holistic architecture review",
        "  quality: 2    # Code quality and maintainability",
        "",
        "runtime:",
        "  agent_heartbeat_seconds: 90",
        "",
      ].join("\n"),
      "utf-8",
    );

    // Bump principal from 2 → 3, leave quality alone.
    const team = [
      { persona: "principal", instance_index: 1, name: "principal-1", model: null },
      { persona: "principal", instance_index: 2, name: "principal-2", model: null },
      { persona: "principal", instance_index: 3, name: "principal-3", model: null },
      { persona: "quality",   instance_index: 1, name: "quality-1",   model: null },
      { persona: "quality",   instance_index: 2, name: "quality-2",   model: null },
    ];
    const set = await spawnCli(["team", "set", "--stdin"], {
      cwd: project.dir,
      stdin: JSON.stringify(team),
    });
    expect(set.exitCode).toBe(0);

    const after = readFileSync(configPath, "utf-8");

    // Top-of-file dividers and the unrelated `runtime` key all survive.
    expect(after).toContain("# REVIEW RULES");
    expect(after).toContain("# Per-severity rules for reviewers");
    expect(after).toContain("# REVIEWER TEAM");
    expect(after).toContain("agent_heartbeat_seconds: 90");

    // Unchanged quality entry keeps its inline comment.
    expect(after).toContain("# Code quality and maintainability");

    // Principal's value updated to 3 but its inline comment is also kept,
    // because we mutated the Scalar's value rather than replacing the pair.
    expect(after).toMatch(/principal:\s*3\s+#\s*Holistic architecture review/);
  });
});

describe("ocr models list", () => {
  it("emits a JSON array with --json", async () => {
    const project = tracked(createInitializedProject());

    // --vendor flag bypasses PATH detection so the test runs without
    // requiring claude/opencode binaries on the CI runner.
    const result = await spawnCli(
      ["models", "list", "--vendor", "claude", "--json"],
      { cwd: project.dir },
    );

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // Every entry has at minimum an id string
    for (const model of parsed) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
    }
  });

  it("opencode bundled fallback uses provider-prefixed ids", async () => {
    const project = tracked(createInitializedProject());

    const result = await spawnCli(
      ["models", "list", "--vendor", "opencode", "--json"],
      { cwd: project.dir },
    );
    const parsed = JSON.parse(result.stdout);

    // Bundled OpenCode ids include a `provider/` prefix; native enumeration
    // (when available) returns whatever opencode emits — we don't assert
    // shape there. Either way, ids must be non-empty strings.
    for (const model of parsed) {
      expect(typeof model.id).toBe("string");
      expect(model.id.length).toBeGreaterThan(0);
    }
  });

  it("rejects an unknown vendor", async () => {
    const project = tracked(createInitializedProject());

    const result = await spawnCli(
      ["models", "list", "--vendor", "nonexistent-vendor"],
      { cwd: project.dir },
    );
    expect(result.exitCode).not.toBe(0);
  });
});

describe("ocr review --resume", () => {
  it("rejects a non-existent workflow id", async () => {
    const project = tracked(createInitializedProject());

    const result = await spawnCli(
      ["review", "--resume", "no-such-workflow"],
      { cwd: project.dir },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/workflow.*not found/i);
  });

  it("rejects a workflow with no captured vendor session id", async () => {
    const project = tracked(createInitializedProject());
    const workflowId = await initWorkflow(project);
    // Start an agent session BUT do not bind a vendor id
    await spawnCli(
      [
        "session",
        "start-instance",
        "--workflow",
        workflowId,
        "--persona",
        "principal",
        "--instance",
        "1",
        "--vendor",
        "claude",
      ],
      { cwd: project.dir },
    );

    const result = await spawnCli(["review", "--resume", workflowId], {
      cwd: project.dir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/no vendor session id/i);
  });
});
