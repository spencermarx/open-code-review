/**
 * Parser for final.md review synthesis files.
 *
 * Extracts verdict, blocker count, should-fix count, and suggestion count.
 *
 * Supports two formats:
 *   1. Explicit count lines:  `**Blockers**: 3`
 *   2. Section-based counting: counts items under `## Blockers` / `## Suggestions`
 *      Items can be `### Title` sub-headings or `- bullet` list items.
 */

export type ParsedFinal = {
  verdict: string | null
  blockerCount: number
  shouldFixCount: number
  suggestionCount: number
}

const VERDICT_RE = /^\*?\*?\s*(?:##\s*)?Verdict\s*\*?\*?\s*:?\s*\*?\*?\s*(.*)/im
const BLOCKERS_RE = /^\*\*Blockers?\*\*\s*:?\s*(\d+)/im
const SHOULD_FIX_RE = /^\*\*Should\s*Fix\*\*\s*:?\s*(\d+)/im
const SUGGESTIONS_RE = /^\*\*Suggestions?\*\*\s*:?\s*(\d+)/im

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

  // Fallback: count items under ## Blocker / ## Should Fix / ## Suggestion headers
  if (!blockerMatch) {
    blockerCount = countSectionItems(content, /^##\s+Blockers?\b/im)
  }
  if (!shouldFixMatch) {
    shouldFixCount = countSectionItems(content, /^##\s+Should\s*Fix\b/im)
  }
  if (!suggestionsMatch) {
    suggestionCount = countSectionItems(content, /^##\s+Suggestions?\b/im)
  }

  return { verdict, blockerCount, shouldFixCount, suggestionCount }
}

/**
 * Counts items under a section heading.
 *
 * Recognises three item patterns:
 *   - `### 1. Title`          (numbered sub-headings)
 *   - `### 🚫 Title`          (emoji-prefixed sub-headings used for blockers)
 *   - `- text — @reviewer`    (bullet items used for suggestions)
 *
 * Category sub-headings (`### Architecture`, `### Testing`) are NOT counted
 * as items — they are grouping headers whose children (bullets) are the
 * actual items.
 *
 * Stops counting at the next `## ` heading or `---` separator.
 */
function countSectionItems(content: string, sectionRe: RegExp): number {
  const match = content.match(sectionRe)
  if (!match?.index && match?.index !== 0) return 0

  const afterSection = content.slice(match.index + (match[0]?.length ?? 0))
  const lines = afterSection.split('\n')
  let count = 0

  for (const line of lines) {
    const trimmed = line.trim()

    // Stop at next ## heading (but not ###) or horizontal rule separator
    if (/^##\s+[^#]/.test(trimmed)) break
    if (/^---+\s*$/.test(trimmed)) break

    // Count numbered sub-headings:  ### 1. Title
    if (/^###\s+\d+\./.test(trimmed)) {
      count++
      continue
    }

    // Count emoji-prefixed sub-headings:  ### 🚫 Title
    if (/^###\s+[^\w\s#]/.test(trimmed)) {
      count++
      continue
    }

    // Count top-level bullet items with attribution:  - "text" — @reviewer
    // or plain bullets directly under the section:     - **Title** — desc
    // Skip sentinel bullets like "- None", "- No blockers", "- N/A"
    if (/^-\s+\S/.test(trimmed)) {
      if (/^-\s+(?:none\b|no\s|n\/a\b)/i.test(trimmed)) continue
      count++
      continue
    }
  }

  return count
}
