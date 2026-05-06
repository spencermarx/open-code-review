/**
 * Shared vendor resume command construction.
 *
 * Both the dashboard's `SessionCaptureService` (via the AiCliAdapter
 * strategy) and the CLI's `ocr review --resume` command consume this
 * module. Single source of truth for argv shape eliminates the class
 * of bugs where one path ships a working command and another ships
 * a broken one (round-2 Blocker 1).
 *
 * Returns argv (as `string[]`) — the canonical form. The string form
 * (`buildResumeCommand`) is derived from argv via shell quoting so the
 * panel's display text and the spawn call cannot drift.
 */

export type SupportedVendor = 'claude' | 'opencode'

export const VENDOR_BINARIES: Record<SupportedVendor, string> = {
  claude: 'claude',
  opencode: 'opencode',
}

/**
 * Returns the argv (binary excluded) for resuming a session with the
 * given vendor. The argv form is the canonical one — call this when
 * you intend to `spawn()` the vendor process.
 *
 * Vendor shapes (verified against vendor docs):
 * - `claude --resume <id>`           — Claude Code's documented resume flag
 * - `opencode --session <id>`        — OpenCode's interactive resume of a
 *                                       specific session. The previously
 *                                       used `run "" --session <id> --continue`
 *                                       form passed an empty positional that
 *                                       OpenCode's `run` argument parser
 *                                       rejects ("message cannot be empty").
 */
export function buildResumeArgs(
  vendor: string,
  vendorSessionId: string,
): string[] {
  if (vendor === 'claude') {
    return ['--resume', vendorSessionId]
  }
  if (vendor === 'opencode') {
    return ['--session', vendorSessionId]
  }
  throw new Error(
    `Unknown vendor "${vendor}". OCR knows how to resume Claude Code and OpenCode.`,
  )
}

/**
 * Quote a single shell token. Wraps in single quotes when the token
 * contains characters with special meaning to common shells, escaping
 * any embedded single quotes via the standard `'\''` trick. Tokens
 * without special characters are returned bare so the most common
 * case (vanilla session ids, vendor flags) reads cleanly.
 */
function shellQuote(token: string): string {
  if (token === '') return "''"
  if (/^[A-Za-z0-9_./:=@-]+$/.test(token)) return token
  return `'${token.replace(/'/g, "'\\''")}'`
}

/**
 * Returns the full shell command string the user can paste into a
 * terminal. Derived from `buildResumeArgs` — never hand-rolled, so the
 * display string and the spawn argv cannot disagree on shape.
 */
export function buildResumeCommand(
  vendor: string,
  vendorSessionId: string,
): string {
  const binary = VENDOR_BINARIES[vendor as SupportedVendor] ?? vendor
  const args = buildResumeArgs(vendor, vendorSessionId)
  return [binary, ...args].map(shellQuote).join(' ')
}
