/**
 * Child-process environment builder — the single authority for what a
 * dashboard-spawned child (AI CLI, `gh`, `ocr`) inherits.
 *
 * Posture (spec: dashboard "Shell-Parity Child Environment Inheritance"):
 * children receive the environment of the shell that launched
 * `ocr dashboard`, captured as a frozen snapshot at launch, minus only the
 * internal denylist below, plus only registered injections. There is no
 * public configuration surface for this — the correct default leaves a knob
 * with nothing to do, and the escape hatch for subtracting a variable is the
 * shell itself (`env -u VAR ocr dashboard`).
 *
 * The denylist is NOT a confidentiality boundary and must never become one:
 * children run as the same user with unrestricted filesystem read, so env
 * stripping cannot keep a secret from them. Membership is governed by three
 * criteria — (a) OCR-owned namespace, (b) spawner-lifecycle residue the
 * interactive shell never had, (c) a named child-stability hazard with a
 * written failure mode. Secret-shaped and third-party provider names are
 * categorically inadmissible; additions require an OpenSpec amendment naming
 * the admitting criterion and the concrete failure mode.
 *
 * Lives in the platform package because both apps consume it: the dashboard
 * builds every child env through it, and the CLI's `ocr doctor` prints the
 * posture from the same constants so prose can never drift from behavior.
 */

/**
 * (a) OCR-owned namespace. A stale inherited `OCR_DASHBOARD_EXECUTION_UID`
 * mis-links workflow rows (the durable spawn-marker exists precisely because
 * of that hazard); nothing under `OCR_` may ever flow ambiently. Deliberate
 * per-spawn injection returns via the closed `inject` channel, applied after
 * the deny step.
 */
const OCR_PREFIX = "OCR_";

/**
 * (b) Spawner-lifecycle residue. npm/pnpm/yarn inject lowercase
 * `npm_config_*` / `npm_package_*` / `npm_lifecycle_*` / `npm_execpath`
 * residue into every script child; the interactive shell never had it, so
 * stripping it RESTORES shell parity. POSIX matching is lowercase-exact on
 * the `npm_` prefix: user-authored uppercase `NPM_TOKEN` / `NPM_CONFIG_*`
 * must pass through (stripping them would 401 private-registry auth in
 * children). On Windows, env names are case-insensitive so residue and user
 * exports collide undecidably; the grab is scoped to the residue
 * sub-namespaces and the collision is documented rather than pretended away.
 */
const NPM_RESIDUE_PREFIX_POSIX = "npm_";
const NPM_RESIDUE_PREFIXES_WINDOWS = [
  "npm_config_",
  "npm_package_",
  "npm_lifecycle_",
];
// `npm_command` completes the residue enumeration for the same entry: npm
// injects it (e.g. "run-script") alongside the lifecycle vars.
const NPM_RESIDUE_NAMES_WINDOWS = [
  "npm_execpath",
  "npm_node_execpath",
  "npm_command",
];

/**
 * (b) npm launch residue injected OUTSIDE the `npm_` prefix: nested npm
 * inside a child resolves against the dashboard's launch directory — a
 * wrong-directory bug presenting as "file not found".
 */
const INIT_CWD = "INIT_CWD";

/**
 * (c) Named child-stability hazard: `NODE_OPTIONS` injects flags into every
 * node child (the AI CLIs, `ocr`, gh shims). An inherited `--inspect`
 * collides inspector ports across concurrent reviewer children; `--require`
 * warps behavior invisibly (VS Code strips it for the same reason —
 * `removeDangerousEnvVariables`). This is the ONE denylist entry that can
 * carry deliberate user intent (`--max-old-space-size`), so it is the single
 * intentional shell-parity break: observability surfaces state its removal
 * with explicit causality, and a demonstrated support case is the
 * pre-approved trigger for revisiting the entry.
 */
const NODE_OPTIONS = "NODE_OPTIONS";

/**
 * The only keys a caller may deliberately inject into a child env. Enforced
 * at runtime — the closed TypeScript type on `inject` erases at compile
 * time and reviewers rotate; the throw does not. Additions require the same
 * OpenSpec amendment path as denylist entries.
 */
export const ALLOWED_INJECT_KEYS = Object.freeze([
  "OCR_DASHBOARD_EXECUTION_UID",
] as const);

type AllowedInjectKey = (typeof ALLOWED_INJECT_KEYS)[number];

export type ChildEnvInject = Readonly<
  Partial<Record<AllowedInjectKey, string | undefined>>
>;

export type ChildEnvResult = {
  /** Null-prototype env for spawn — immune to `__proto__` key collisions. */
  env: NodeJS.ProcessEnv;
  /** Names removed by the denylist — names only, never values. */
  removed: readonly string[];
  /** Names deliberately injected — names only, never values. */
  injected: readonly string[];
};

/**
 * Whether `name` matches the denylist on this platform. Windows matches
 * every entry case-insensitively (env names are case-insensitive there — a
 * child's Node reads `Node_Options` exactly as `NODE_OPTIONS`, so an
 * exact-case deny would void the guarantee on the case variant). POSIX
 * matches exact-case: a variable literally named `node_options` is unread
 * by Node, and stripping it would violate shell parity — the same logic
 * that protects `NPM_TOKEN`.
 */
function isDenied(name: string, windows: boolean): boolean {
  if (windows) {
    const lower = name.toLowerCase();
    return (
      lower.startsWith(OCR_PREFIX.toLowerCase()) ||
      NPM_RESIDUE_PREFIXES_WINDOWS.some((p) => lower.startsWith(p)) ||
      NPM_RESIDUE_NAMES_WINDOWS.includes(lower) ||
      lower === INIT_CWD.toLowerCase() ||
      lower === NODE_OPTIONS.toLowerCase()
    );
  }
  return (
    name.startsWith(OCR_PREFIX) ||
    name.startsWith(NPM_RESIDUE_PREFIX_POSIX) ||
    name === INIT_CWD ||
    name === NODE_OPTIONS
  );
}

/**
 * Build a child env from the frozen launch-shell snapshot: apply the
 * denylist to `base`, then apply `inject` (after the deny step, so a stale
 * ambient `OCR_*` dies while the deliberate per-spawn injection survives).
 *
 * Pure: same inputs, same output; no reads of `process.env` (spawn modules
 * are lint-banned from touching it). Throws if `inject` carries a key
 * outside {@link ALLOWED_INJECT_KEYS} — no request-derived data may ever
 * become or override child env (the httpoxy / GH-Actions `set-env` lesson).
 * An inject entry with an `undefined` value passes the membership check and
 * is omitted from both the env and the `injected` list, matching Node's own
 * spawn-env handling.
 */
export function buildChildEnv(
  base: Readonly<NodeJS.ProcessEnv>,
  inject?: ChildEnvInject,
): ChildEnvResult {
  return buildChildEnvForPlatform(process.platform, base, inject);
}

/**
 * Platform-parameterized variant of {@link buildChildEnv}. The parameter is
 * an OS seam so the Windows matching rules are testable from POSIX test
 * runs — it is NOT a policy lever; the deny rules themselves are compiled
 * in. Production spawn paths call {@link buildChildEnv}.
 */
export function buildChildEnvForPlatform(
  platform: NodeJS.Platform,
  base: Readonly<NodeJS.ProcessEnv>,
  inject?: ChildEnvInject,
): ChildEnvResult {
  const windows = platform === "win32";
  const env = Object.create(null) as NodeJS.ProcessEnv;
  const removed: string[] = [];

  for (const key of Object.keys(base)) {
    if (base[key] === undefined) continue;
    if (isDenied(key, windows)) {
      removed.push(key);
      continue;
    }
    env[key] = base[key];
  }

  const injected: string[] = [];
  if (inject) {
    for (const key of Object.keys(inject)) {
      if (!(ALLOWED_INJECT_KEYS as readonly string[]).includes(key)) {
        throw new Error(
          `buildChildEnv: inject key "${key}" is not in ALLOWED_INJECT_KEYS — ` +
            `child-env injection is a closed channel (see the dashboard ` +
            `child-process environment spec)`,
        );
      }
      const value = inject[key as AllowedInjectKey];
      if (value === undefined) continue;
      env[key] = value;
      injected.push(key);
    }
  }

  return { env, removed, injected };
}

/**
 * Human-readable posture text generated from the same constants that drive
 * {@link buildChildEnv} — the doctor/startup/docs surface can never drift
 * from behavior. Names only; this module never sees or prints values.
 */
export function describeChildEnvPosture(): string[] {
  return [
    "Dashboard children inherit the environment of the shell that launched " +
      "'ocr dashboard' (snapshot at launch; restart to pick up new exports).",
    "Removed: OCR_* internals, npm_* script-lifecycle residue, INIT_CWD, " +
      `and ${NODE_OPTIONS} — the one intentional shell-parity break ` +
      "(inspector-port and --require hazards for concurrent node children).",
    "To withhold a variable from children: env -u VAR ocr dashboard",
  ];
}
