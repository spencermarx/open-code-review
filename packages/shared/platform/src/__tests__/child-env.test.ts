import { describe, it, expect } from "vitest";
import {
  ALLOWED_INJECT_KEYS,
  buildChildEnv,
  buildChildEnvForPlatform,
  describeChildEnvPosture,
} from "../index.js";

/**
 * Pins the dashboard child-env posture (spec: "Shell-Parity Child
 * Environment Inheritance" + "Internal Environment Denylist By Criteria" +
 * "Closed Child-Env Injection Channel"): inherit everything, remove only the
 * criteria-governed denylist, inject only registered keys — with the
 * platform-specific matching rules and the null-prototype hardening pinned
 * so a refactor cannot silently reopen them.
 */
describe("buildChildEnv", () => {
  it("passes provider and proxy variables through untouched", () => {
    const { env, removed } = buildChildEnvForPlatform("linux", {
      AWS_BEARER_TOKEN_BEDROCK: "tok",
      AWS_REGION: "us-west-2",
      HTTPS_PROXY: "http://proxy:8080",
      SSL_CERT_FILE: "/etc/ca.pem",
      PATH: "/usr/bin",
    });
    expect(env.AWS_BEARER_TOKEN_BEDROCK).toBe("tok");
    expect(env.AWS_REGION).toBe("us-west-2");
    expect(env.HTTPS_PROXY).toBe("http://proxy:8080");
    expect(env.SSL_CERT_FILE).toBe("/etc/ca.pem");
    expect(env.PATH).toBe("/usr/bin");
    expect(removed).toEqual([]);
  });

  it("strips OCR_* ambient values while a deliberate injection survives", () => {
    const { env, removed, injected } = buildChildEnvForPlatform(
      "linux",
      { OCR_DASHBOARD_EXECUTION_UID: "stale", OCR_REVIEW_ID: "r1", HOME: "/h" },
      { OCR_DASHBOARD_EXECUTION_UID: "fresh" },
    );
    expect(env.OCR_DASHBOARD_EXECUTION_UID).toBe("fresh");
    expect(env.OCR_REVIEW_ID).toBeUndefined();
    expect(env.HOME).toBe("/h");
    expect(removed).toContain("OCR_DASHBOARD_EXECUTION_UID");
    expect(removed).toContain("OCR_REVIEW_ID");
    expect(injected).toEqual(["OCR_DASHBOARD_EXECUTION_UID"]);
  });

  it("strips lowercase npm residue and INIT_CWD on POSIX but preserves NPM_TOKEN", () => {
    const { env, removed } = buildChildEnvForPlatform("darwin", {
      npm_config_registry: "https://r",
      npm_lifecycle_event: "start",
      npm_node_execpath: "/usr/bin/node",
      INIT_CWD: "/launch/dir",
      NPM_TOKEN: "secret",
      NPM_CONFIG_REGISTRY: "https://corp",
    });
    expect(env.npm_config_registry).toBeUndefined();
    expect(env.npm_lifecycle_event).toBeUndefined();
    expect(env.npm_node_execpath).toBeUndefined();
    expect(env.INIT_CWD).toBeUndefined();
    expect(env.NPM_TOKEN).toBe("secret");
    expect(env.NPM_CONFIG_REGISTRY).toBe("https://corp");
    expect(removed).toEqual(
      expect.arrayContaining([
        "npm_config_registry",
        "npm_lifecycle_event",
        "npm_node_execpath",
        "INIT_CWD",
      ]),
    );
  });

  it("strips NODE_OPTIONS and reports it in removed", () => {
    const { env, removed } = buildChildEnvForPlatform("linux", {
      NODE_OPTIONS: "--inspect",
      PATH: "/usr/bin",
    });
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(removed).toEqual(["NODE_OPTIONS"]);
  });

  it("leaves a POSIX variable literally named node_options untouched", () => {
    // Node never reads the lowercase spelling on POSIX; stripping it would
    // violate shell parity (same logic that protects NPM_TOKEN).
    const { env, removed } = buildChildEnvForPlatform("linux", {
      node_options: "user-owned",
    });
    expect(env.node_options).toBe("user-owned");
    expect(removed).toEqual([]);
  });

  it("matches every deny entry case-insensitively on Windows", () => {
    const { env, removed } = buildChildEnvForPlatform("win32", {
      Node_Options: "--inspect",
      Ocr_Dashboard_Execution_Uid: "stale",
      Init_Cwd: "C:\\launch",
      NPM_CONFIG_REGISTRY: "https://corp",
      Path: "C:\\Windows",
    });
    expect(env.Node_Options).toBeUndefined();
    expect(env.Ocr_Dashboard_Execution_Uid).toBeUndefined();
    expect(env.Init_Cwd).toBeUndefined();
    // Windows collision is undecidable and documented: the residue
    // sub-namespace grab takes NPM_CONFIG_* case-insensitively.
    expect(env.NPM_CONFIG_REGISTRY).toBeUndefined();
    expect(env.Path).toBe("C:\\Windows");
    expect(removed).toEqual(
      expect.arrayContaining([
        "Node_Options",
        "Ocr_Dashboard_Execution_Uid",
        "Init_Cwd",
        "NPM_CONFIG_REGISTRY",
      ]),
    );
  });

  it("throws on an inject key outside ALLOWED_INJECT_KEYS", () => {
    expect(() =>
      buildChildEnvForPlatform("linux", { PATH: "/usr/bin" }, {
        GIT_DIR: "/tmp/evil",
      } as never),
    ).toThrow(/ALLOWED_INJECT_KEYS/);
  });

  it("omits an undefined inject value from env and the injected list", () => {
    const { env, injected } = buildChildEnvForPlatform(
      "linux",
      { PATH: "/usr/bin" },
      { OCR_DASHBOARD_EXECUTION_UID: undefined },
    );
    expect("OCR_DASHBOARD_EXECUTION_UID" in env).toBe(false);
    expect(injected).toEqual([]);
  });

  it("returns a null-prototype env so __proto__ is an ordinary key", () => {
    const base = Object.create(null) as NodeJS.ProcessEnv;
    Object.defineProperty(base, "__proto__", {
      value: "proto-value",
      configurable: true,
      enumerable: true,
      writable: true,
    });
    const { env } = buildChildEnvForPlatform("linux", base);
    expect(Object.getPrototypeOf(env)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(env, "__proto__")).toBe(true);
    expect(env["__proto__"]).toBe("proto-value");
  });

  it("binds the public entry point to the real platform", () => {
    const { env } = buildChildEnv({ PATH: "/usr/bin", OCR_X: "y" });
    expect(env.PATH).toBe("/usr/bin");
    expect(env.OCR_X).toBeUndefined();
  });

  it("keeps the inject allowlist closed to exactly the execution UID", () => {
    expect([...ALLOWED_INJECT_KEYS]).toEqual(["OCR_DASHBOARD_EXECUTION_UID"]);
  });
});

describe("describeChildEnvPosture", () => {
  it("names the denylist categories and the env -u escape hatch", () => {
    const text = describeChildEnvPosture().join("\n");
    expect(text).toContain("OCR_*");
    expect(text).toContain("npm_*");
    expect(text).toContain("NODE_OPTIONS");
    expect(text).toContain("env -u VAR ocr dashboard");
  });
});
