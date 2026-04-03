/**
 * Dashboard smoke tests.
 *
 * Starts a real dashboard server instance and verifies API endpoints
 * respond correctly. No mocks — all HTTP requests hit the running server.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestServer,
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
