/**
 * Parser for final.md review synthesis files.
 *
 * Extracts verdict, blocker count, should-fix count, and suggestion count.
 */

export type ParsedFinal = {
  verdict: string | null
  blockerCount: number
  shouldFixCount: number
  suggestionCount: number
}

const VERDICT_RE = /^\*?\*?\s*(?:##\s*)?Verdict\s*\*?\*?\s*:?\s*\*?\*?\s*(.*)/im
const BLOCKERS_RE = /\*?\*?Blockers?\*?\*?\s*:?\s*(\d+)/i
const SHOULD_FIX_RE = /\*?\*?Should\s*Fix\*?\*?\s*:?\s*(\d+)/i
const SUGGESTIONS_RE = /\*?\*?Suggestions?\*?\*?\s*:?\s*(\d+)/i

/**
 * Parses a final.md file into structured review metadata.
 */
export function parseFinalMd(content: string): ParsedFinal {
  // Extract verdict
  let verdict: string | null = null
  const verdictMatch = content.match(VERDICT_RE)
  if (verdictMatch) {
    verdict = (verdictMatch[1] ?? '')
      .trim()
      .replace(/^\*+|\*+$/g, '') // strip bold markers
      .trim()
  }

  // Extract counts - search for patterns anywhere in the content
  const blockerMatch = content.match(BLOCKERS_RE)
  const shouldFixMatch = content.match(SHOULD_FIX_RE)
  const suggestionsMatch = content.match(SUGGESTIONS_RE)

  // If no explicit count lines found, try counting sections
  let blockerCount = blockerMatch ? parseInt(blockerMatch[1] ?? '0', 10) : 0
  let shouldFixCount = shouldFixMatch ? parseInt(shouldFixMatch[1] ?? '0', 10) : 0
  let suggestionCount = suggestionsMatch ? parseInt(suggestionsMatch[1] ?? '0', 10) : 0

  // Fallback: count ## Blocker, ## Should Fix, ## Suggestion headers
  if (!blockerMatch) {
    blockerCount = countSectionHeaders(content, /^##\s+Blockers?\b/im)
  }
  if (!shouldFixMatch) {
    shouldFixCount = countSectionHeaders(content, /^##\s+Should\s*Fix\b/im)
  }
  if (!suggestionsMatch) {
    suggestionCount = countSectionHeaders(content, /^##\s+Suggestions?\b/im)
  }

  return { verdict, blockerCount, shouldFixCount, suggestionCount }
}

/**
 * Counts numbered items under a section heading.
 */
function countSectionHeaders(content: string, sectionRe: RegExp): number {
  const match = content.match(sectionRe)
  if (!match?.index) return 0

  // Count ### sub-headings under this section until the next ## heading
  const afterSection = content.slice(match.index + (match[0]?.length ?? 0))
  const lines = afterSection.split('\n')
  let count = 0

  for (const line of lines) {
    // Stop at next ## heading (but not ###)
    if (line.match(/^##\s+[^#]/) && !line.match(/^###/)) break
    if (line.match(/^###\s+\d+\./)) count++
  }

  return count
}
