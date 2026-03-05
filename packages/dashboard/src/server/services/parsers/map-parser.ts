/**
 * Parser for map.md files produced by the Code Review Map workflow.
 *
 * Handles two formats:
 * 1. Table format: rows with | File | Role | +/- |
 * 2. Checkbox list format: - [ ] `path/to/file` — Role description
 */

export type ParsedMapFile = {
  filePath: string
  role: string
  linesAdded: number
  linesDeleted: number
}

export type ParsedMapSection = {
  sectionNumber: number
  title: string
  description: string
  files: ParsedMapFile[]
}

export type ParsedSectionDep = {
  fromSection: number
  fromTitle: string
  toSection: number
  toTitle: string
  relationship: string
}

export type ParsedMap = {
  sections: ParsedMapSection[]
  dependencies: ParsedSectionDep[]
}

const SECTION_HEADING_RE = /^#{2,3}\s+(?:Section\s+(\d+)[:\s]*\s*)?(.+)/
// Format: | `file` | Role | +42/-10 |
const TABLE_ROW_RE = /^\|\s*`?([^|`]+?)`?\s*\|\s*([^|]*?)\s*\|\s*\+?(\d+)\s*\/\s*-?(\d+)\s*\|/
// Format: | Done | `file` | Role |  (Done column first, no line counts)
const DONE_TABLE_ROW_RE = /^\|\s*(?:[xX✅☑✓]|\s*)\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/
const CHECKBOX_FILE_RE = /^-\s*\[[ x]\]\s*`([^`]+)`(?:\s*[—–-]\s*(.*))?/i
const LINES_CHANGE_RE = /\+(\d+)\/-(\d+)/

/**
 * Parses a map.md file into structured sections and files.
 */
export function parseMapMd(content: string): ParsedMap {
  const lines = content.split('\n')
  const sections: ParsedMapSection[] = []

  let currentSection: ParsedMapSection | null = null
  let descriptionLines: string[] = []
  let inFilesBlock = false
  let sectionCounter = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    // Detect section headings (## Section N: Title or ## Title under Sections)
    const sectionMatch = line.match(SECTION_HEADING_RE)
    if (sectionMatch) {
      const title = (sectionMatch[2] ?? '').trim()

      // Skip non-section headings (metadata headings like "Executive Summary", etc.)
      if (isMetaHeading(title)) {
        // If we were building a section, finalize it
        if (currentSection) {
          currentSection.description = descriptionLines.join('\n').trim()
          sections.push(currentSection)
          currentSection = null
          descriptionLines = []
          inFilesBlock = false
        }
        continue
      }

      // Finalize previous section
      if (currentSection) {
        currentSection.description = descriptionLines.join('\n').trim()
        sections.push(currentSection)
      }

      sectionCounter++
      const sectionNum = sectionMatch[1] ? parseInt(sectionMatch[1], 10) : sectionCounter
      currentSection = {
        sectionNumber: sectionNum,
        title,
        description: '',
        files: [],
      }
      descriptionLines = []
      inFilesBlock = false
      continue
    }

    if (!currentSection) continue

    // Detect files block markers
    if (line.match(/^\*\*Files\*\*/i) || line.match(/^\|\s*File\s*\|/i) || line.match(/^\|\s*Done\s*\|/i)) {
      inFilesBlock = true
      // Don't add this line to description
      continue
    }

    // Table separator line
    if (inFilesBlock && line.match(/^\|[-\s|]+\|$/)) {
      continue
    }

    // Parse table row format: | path/to/file.ts | Role | +42/-10 |
    const tableMatch = line.match(TABLE_ROW_RE)
    if (tableMatch && currentSection) {
      inFilesBlock = true
      currentSection.files.push({
        filePath: (tableMatch[1] ?? '').trim(),
        role: (tableMatch[2] ?? '').trim(),
        linesAdded: parseInt(tableMatch[3] ?? '0', 10),
        linesDeleted: parseInt(tableMatch[4] ?? '0', 10),
      })
      continue
    }

    // Parse "Done | File | Role" table row (no line counts)
    const doneTableMatch = line.match(DONE_TABLE_ROW_RE)
    if (doneTableMatch && currentSection) {
      inFilesBlock = true
      currentSection.files.push({
        filePath: (doneTableMatch[1] ?? '').trim(),
        role: (doneTableMatch[2] ?? '').trim(),
        linesAdded: 0,
        linesDeleted: 0,
      })
      continue
    }

    // Parse checkbox list format: - [ ] `path/to/file` — Role description
    const checkboxMatch = line.match(CHECKBOX_FILE_RE)
    if (checkboxMatch && currentSection) {
      inFilesBlock = true
      const role = (checkboxMatch[2] ?? '').trim()
      const linesMatch = role.match(LINES_CHANGE_RE)
      currentSection.files.push({
        filePath: (checkboxMatch[1] ?? '').trim(),
        role: linesMatch ? role.replace(LINES_CHANGE_RE, '').trim() : role,
        linesAdded: linesMatch ? parseInt(linesMatch[1] ?? '0', 10) : 0,
        linesDeleted: linesMatch ? parseInt(linesMatch[2] ?? '0', 10) : 0,
      })
      continue
    }

    // Collect description lines (before files block)
    if (!inFilesBlock) {
      // Skip **The Story**: prefix
      const storyMatch = line.match(/^\*\*The Story\*\*:\s*(.*)/)
      if (storyMatch) {
        descriptionLines.push(storyMatch[1] ?? '')
      } else {
        descriptionLines.push(line)
      }
    }

    // A horizontal rule or another heading resets the files block
    if (line.match(/^---\s*$/) || line.match(/^###/)) {
      inFilesBlock = false
    }
  }

  // Finalize last section
  if (currentSection) {
    currentSection.description = descriptionLines.join('\n').trim()
    sections.push(currentSection)
  }

  const dependencies = parseSectionDependencies(content)

  return { sections, dependencies }
}

/**
 * Parses the ## Section Dependencies table from map.md.
 * Each row: | {num}: {Title} | {num}: {Title} | {Relationship} |
 */
const SECTION_DEP_ROW_RE = /^\|\s*(\d+):\s*(.+?)\s*\|\s*(\d+):\s*(.+?)\s*\|\s*(.+?)\s*\|/

function parseSectionDependencies(content: string): ParsedSectionDep[] {
  // Find the ## Section Dependencies block
  const blockMatch = content.match(
    /## Section Dependencies\s*\n[\s\S]*?\n\|[^|]*\|[^|]*\|[^|]*\|\s*\n\|[-\s|]+\|\s*\n([\s\S]*?)(?=\n---|\n## |\n$)/,
  )
  if (!blockMatch?.[1]) return []

  const deps: ParsedSectionDep[] = []
  for (const line of blockMatch[1].split('\n')) {
    const m = line.match(SECTION_DEP_ROW_RE)
    if (m) {
      deps.push({
        fromSection: parseInt(m[1] ?? '0', 10),
        fromTitle: (m[2] ?? '').trim(),
        toSection: parseInt(m[3] ?? '0', 10),
        toTitle: (m[4] ?? '').trim(),
        relationship: (m[5] ?? '').trim(),
      })
    }
  }
  return deps
}

/**
 * Headings that are NOT review sections (metadata/boilerplate).
 */
function isMetaHeading(title: string): boolean {
  const meta = [
    'executive summary',
    'how to use this map',
    'smoke tests',
    'manual verification',
    'unrelated changes',
    'file index',
    'requirements summary',
    'manual review suggestions',
    'reviewer checklist',
    'map metadata',
    'key approaches',
    'assumptions made',
    'critical path tests',
    'edge case tests',
    'error handling tests',
    'non-functional checks',
    'test environment notes',
    'coverage matrix',
    'unaddressed requirements',
    'questions for author',
    'questions & clarifications',
    'requirements coverage',
    'critical review focus',
    'critical review points',
    'critical path',
    'edge cases',
    'edge cases & error handling',
    'non-functional',
    'security-sensitive areas',
    'architectural decisions to verify',
    'edge cases requiring human judgment',
    'requirements verification points',
    'file review',
    'section dependencies',
    'sections',
    'verification',
    'manual review',
    'completion',
  ]
  return meta.some((m) => title.toLowerCase().startsWith(m))
}
