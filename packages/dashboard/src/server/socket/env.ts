/**
 * Shared environment utilities for spawning Claude CLI processes.
 */

/**
 * Build a clean env for spawning Claude as a child process.
 * Strips vars that would make it think it's inside another Claude session.
 */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env['CLAUDECODE']
  delete env['CLAUDE_SESSION_ID']
  delete env['CLAUDE_CONVERSATION_ID']
  return env
}
