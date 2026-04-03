/**
 * Dashboard smoke tests.
 *
 * Starts a real dashboard server instance and verifies API endpoints
 * respond correctly. No mocks — all HTTP requests hit the running server.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestServer,
  startServerEarly,
  type ServerInstance,
} from "./helpers/server-harness.js";

let server: ServerInstance;

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  await server?.cleanup();
});

/** Helper for authenticated API requests. */
function apiFetch(path: string, opts?: RequestInit): Promise<Response> {
  return fetch(`${server.baseUrl}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${server.token}`,
      ...opts?.headers,
    },
  });
}

describe("Dashboard smoke tests", () => {
  describe("health check", () => {
    it("GET /api/health returns 200 without auth", async () => {
      const res = await fetch(`${server.baseUrl}/api/health`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ status: "ok" });
    });
  });

  describe("authentication", () => {
    it("GET /auth/token returns a bearer token", async () => {
      const res = await fetch(`${server.baseUrl}/auth/token`);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string };
      expect(body.token).toBeTruthy();
      expect(typeof body.token).toBe("string");
    });

    it("GET /api/config without token returns 401", async () => {
      const res = await fetch(`${server.baseUrl}/api/config`);

      expect(res.status).toBe(401);
    });

    it("GET /api/config with valid token returns 200", async () => {
      const res = await apiFetch("/api/config");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("projectRoot");
    });
  });

  describe("port discovery", () => {
    it("health endpoint is reachable at the port advertised in server-port file", () => {
      // The Vite dev proxy reads .ocr/data/server-port to find the server.
      // If this file points to the wrong port, the dashboard is unreachable.
      const portFile = resolve(server.ocrDir, "data", "server-port");
      const advertisedPort = parseInt(
        readFileSync(portFile, "utf-8").trim(),
        10,
      );

      // The advertised port must match where the server actually listens
      expect(advertisedPort).toBe(server.port);
    });

    it("stale port file is cleared before server binds its port", async () => {
      // Regression test for the dev proxy port race condition.
      //
      // In the real dev flow, Vite reads .ocr/data/server-port during
      // its ~2s startup delay to configure the proxy target. If a stale
      // file from a previous run still has the old port, Vite targets
      // a dead address → blank page, "Unexpected token '<'".
      //
      // We reproduce the exact race: write a stale port file, fork the
      // server, and read the file during the startup window (before the
      // server is healthy). This is what Vite does. The stale value must
      // already be gone — the server should delete it synchronously at
      // the start of initialization, before any async work.
      const early = startServerEarly({ stalePort: 9999 });

      try {
        // Poll until the stale port value is gone (deleted or replaced).
        // The server deletes the port file synchronously at the start of
        // initialization, before any async work.
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          if (existsSync(early.portFilePath)) {
            const value = parseInt(
              readFileSync(early.portFilePath, "utf-8").trim(),
              10,
            );
            if (value !== 9999) break; // Stale value replaced
          } else {
            break; // File deleted
          }
          await new Promise((r) => setTimeout(r, 50));
        }

        // The stale value (9999) must NOT be present.
        if (existsSync(early.portFilePath)) {
          const value = parseInt(
            readFileSync(early.portFilePath, "utf-8").trim(),
            10,
          );
          expect(value).not.toBe(9999);
        }
        // If the file doesn't exist, that's also correct — stale deleted,
        // server hasn't written the new value yet. Vite falls back to 4173.

        // After full startup, verify the file has the correct port
        await early.waitForHealth();
        const finalPort = parseInt(
          readFileSync(early.portFilePath, "utf-8").trim(),
          10,
        );
        expect(finalPort).toBe(early.port);
      } finally {
        await early.cleanup();
      }
    });
  });

  describe("API endpoints", () => {
    it("GET /api/sessions returns an array", async () => {
      const res = await apiFetch("/api/sessions");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/stats returns aggregate stats", async () => {
      const res = await apiFetch("/api/stats");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("totalSessions");
    });

    it("GET /api/commands returns an array", async () => {
      const res = await apiFetch("/api/commands");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it("GET /api/reviewers returns reviewer list", async () => {
      const res = await apiFetch("/api/reviewers");

      expect(res.status).toBe(200);
    });
  });
});
