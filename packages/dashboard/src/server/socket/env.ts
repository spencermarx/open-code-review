/**
 * Shared environment utilities for spawning Claude CLI processes.
 */

/** Environment variables allowed to pass through to spawned processes. */
const ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'LANG',
  'TERM',
  'ANTHROPIC_API_KEY',
  'NODE_ENV',
  'SHELL',
  'USER',
  'TMPDIR',
] as const

/**
 * Build a clean env for spawning Claude as a child process.
 * Uses an allowlist so only known-safe variables are passed through.
 */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]
    }
  }
  return env
}
