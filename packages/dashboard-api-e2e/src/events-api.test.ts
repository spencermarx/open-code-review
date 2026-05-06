/**
 * Events route end-to-end tests.
 *
 * Verifies that the events JSONL persisted by command-runner is faithfully
 * exposed via `GET /api/commands/:id/events`. The route is the read side
 * of Phase 1's data-layer widening — it powers rehydration on page reload
 * and history-replay (Phase 4).
 *
 * Khorikov classical school: real built server, real disk JSONL, real HTTP.
 * The write side (command-runner appending events as the AI streams) is
 * covered by the adapter unit tests + an integration smoke; here we focus
 * on the read contract because that's what the React renderer depends on.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestServer, type ServerInstance } from "./helpers/server-harness.js";

let server: ServerInstance;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server?.cleanup();
});

function apiFetch(path: string): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${server.token}` },
  });
}

/** Seed an events JSONL file as if command-runner had written it. */
function seedEventsFile(executionId: number, lines: string[]): void {
  const eventsDir = resolve(server.ocrDir, "data", "events");
  mkdirSync(eventsDir, { recursive: true });
  const path = resolve(eventsDir, `${executionId}.jsonl`);
  writeFileSync(path, lines.map((l) => l + "\n").join(""), "utf-8");
}

describe("GET /api/commands/:id/events", () => {
  it("returns the parsed events array for an execution that has a journal", async () => {
    seedEventsFile(101, [
      JSON.stringify({
        type: "message",
        text: "Reviewing the migration",
        executionId: 101,
        agentId: "orchestrator",
        timestamp: "2026-04-30T14:00:00.000Z",
        seq: 1,
      }),
      JSON.stringify({
        type: "tool_call",
        toolId: "block-3",
        name: "Read",
        input: { file_path: "src/db/migrations.ts" },
        executionId: 101,
        agentId: "orchestrator",
        timestamp: "2026-04-30T14:00:01.000Z",
        seq: 2,
      }),
      JSON.stringify({
        type: "tool_result",
        toolId: "block-3",
        output: "lots of code",
        isError: false,
        executionId: 101,
        agentId: "orchestrator",
        timestamp: "2026-04-30T14:00:02.000Z",
        seq: 3,
      }),
    ]);

    const res = await apiFetch("/api/commands/101/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: number; events: unknown[] };
    expect(body.execution_id).toBe(101);
    expect(body.events).toHaveLength(3);
    const firstEvent = body.events[0] as { type: string; seq: number };
    expect(firstEvent.type).toBe("message");
    expect(firstEvent.seq).toBe(1);
    const tool = body.events[1] as { type: string; toolId: string; name: string };
    expect(tool.type).toBe("tool_call");
    expect(tool.toolId).toBe("block-3");
    expect(tool.name).toBe("Read");
  });

  it("returns an empty events array when no journal exists for that id", async () => {
    const res = await apiFetch("/api/commands/9999/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: number; events: unknown[] };
    expect(body.execution_id).toBe(9999);
    expect(body.events).toEqual([]);
  });

  it("rejects non-numeric ids with 400", async () => {
    const res = await apiFetch("/api/commands/not-a-number/events");
    expect(res.status).toBe(400);
  });

  it("skips malformed lines and returns the rest in order", async () => {
    seedEventsFile(202, [
      JSON.stringify({
        type: "thinking_delta",
        text: "Considering...",
        executionId: 202,
        agentId: "orchestrator",
        timestamp: "2026-04-30T14:01:00.000Z",
        seq: 1,
      }),
      "{this is corrupt json",
      JSON.stringify({
        type: "message",
        text: "Done",
        executionId: 202,
        agentId: "orchestrator",
        timestamp: "2026-04-30T14:01:02.000Z",
        seq: 2,
      }),
    ]);

    const res = await apiFetch("/api/commands/202/events");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { events: Array<{ seq: number; type: string }> };
    expect(body.events).toHaveLength(2);
    expect(body.events[0]?.type).toBe("thinking_delta");
    expect(body.events[1]?.type).toBe("message");
  });

  it("requires the bearer token", async () => {
    const res = await fetch(`${server.baseUrl}/api/commands/1/events`);
    expect(res.status).toBe(401);
  });
});
