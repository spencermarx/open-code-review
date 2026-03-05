import { describe, it, expect } from 'vitest'
import { parseMapMd } from '../parsers/map-parser.js'

describe('parseMapMd', () => {
  it('parses table-format map.md', () => {
    const content = `# Code Review Map: My Feature

## Section 1: Database Layer

This section covers the database changes.

| File | Role | +/- |
|------|------|-----|
| src/db/schema.ts | Core implementation | +42/-10 |
| src/db/migrations.ts | Migration runner | +15/-3 |

## Section 2: API Layer

API endpoint updates.

| File | Role | +/- |
|------|------|-----|
| src/api/routes.ts | Route definitions | +20/-5 |
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(2)

    expect(result.sections[0]?.sectionNumber).toBe(1)
    expect(result.sections[0]?.title).toBe('Database Layer')
    expect(result.sections[0]?.files).toHaveLength(2)
    expect(result.sections[0]?.files[0]).toEqual({
      filePath: 'src/db/schema.ts',
      role: 'Core implementation',
      linesAdded: 42,
      linesDeleted: 10,
    })
    expect(result.sections[0]?.files[1]).toEqual({
      filePath: 'src/db/migrations.ts',
      role: 'Migration runner',
      linesAdded: 15,
      linesDeleted: 3,
    })

    expect(result.sections[1]?.sectionNumber).toBe(2)
    expect(result.sections[1]?.title).toBe('API Layer')
    expect(result.sections[1]?.files).toHaveLength(1)
  })

  it('parses checkbox-format map.md (real OCR output)', () => {
    const content = `# Code Review Map

**Session**: test-session
**Files**: 3 changed files

---

## Sections

### Section 1: OpenSpec Requirements

**The Story**: This section defines the requirements.

**Files** (2):

- [ ] \`openspec/proposal.md\` — High-level change proposal
- [x] \`openspec/design.md\` — Architectural decisions

### Section 2: Implementation

The actual code changes.

**Files** (1):

- [ ] \`src/index.ts\` — Main entry point
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(2)

    expect(result.sections[0]?.title).toBe('OpenSpec Requirements')
    expect(result.sections[0]?.description).toContain('This section defines the requirements.')
    expect(result.sections[0]?.files).toHaveLength(2)
    expect(result.sections[0]?.files[0]?.filePath).toBe('openspec/proposal.md')
    expect(result.sections[0]?.files[0]?.role).toBe('High-level change proposal')
    expect(result.sections[0]?.files[1]?.filePath).toBe('openspec/design.md')

    expect(result.sections[1]?.title).toBe('Implementation')
    expect(result.sections[1]?.files).toHaveLength(1)
    expect(result.sections[1]?.files[0]?.filePath).toBe('src/index.ts')
  })

  it('handles empty content', () => {
    const result = parseMapMd('')
    expect(result.sections).toHaveLength(0)
  })

  it('handles content with no sections', () => {
    const content = `# Code Review Map

Just some text without any sections.
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(0)
  })

  it('skips meta headings like Executive Summary', () => {
    const content = `# Code Review Map

## Executive Summary

Some summary text.

## Section 1: Real Section

**Files** (1):

- [ ] \`src/file.ts\` — A file

## File Index

Not a section.
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]?.title).toBe('Real Section')
  })

  it('extracts description before files block', () => {
    const content = `## Section 1: My Section

**The Story**: This tells the story of the section.
It has multiple lines of description.

**Files** (1):

- [ ] \`src/file.ts\` — A file
`
    const result = parseMapMd(content)
    expect(result.sections[0]?.description).toContain('This tells the story of the section.')
    expect(result.sections[0]?.description).toContain('It has multiple lines of description.')
  })

  it('handles checkbox files with line changes', () => {
    const content = `## Section 1: Changes

**Files** (1):

- [ ] \`src/file.ts\` — Core module +42/-10
`
    const result = parseMapMd(content)
    expect(result.sections[0]?.files[0]?.linesAdded).toBe(42)
    expect(result.sections[0]?.files[0]?.linesDeleted).toBe(10)
    expect(result.sections[0]?.files[0]?.role).not.toContain('+42')
  })

  it('handles sections without explicit numbering', () => {
    const content = `## First Section

- [ ] \`a.ts\` — File A

## Second Section

- [ ] \`b.ts\` — File B
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0]?.sectionNumber).toBe(1)
    expect(result.sections[1]?.sectionNumber).toBe(2)
  })

  it('parses Section Dependencies table', () => {
    const content = `## Section 1: Auth Flow

- [ ] \`src/auth.ts\` — Auth handler

## Section 2: API Layer

- [ ] \`src/api.ts\` — API routes

## Section 3: Database

- [ ] \`src/db.ts\` — DB queries

---

## Section Dependencies

> How sections connect. Used by the dashboard dependency graph.

| From | To | Relationship |
|------|-----|-------------|
| 1: Auth Flow | 2: API Layer | Auth middleware protects routes |
| 2: API Layer | 3: Database | Routes call DB service layer |

---

## File Index
`
    const result = parseMapMd(content)
    expect(result.dependencies).toHaveLength(2)

    expect(result.dependencies[0]).toEqual({
      fromSection: 1,
      fromTitle: 'Auth Flow',
      toSection: 2,
      toTitle: 'API Layer',
      relationship: 'Auth middleware protects routes',
    })
    expect(result.dependencies[1]).toEqual({
      fromSection: 2,
      fromTitle: 'API Layer',
      toSection: 3,
      toTitle: 'Database',
      relationship: 'Routes call DB service layer',
    })
  })

  it('returns empty dependencies when block is missing', () => {
    const content = `## Section 1: Only Section

- [ ] \`src/file.ts\` — A file
`
    const result = parseMapMd(content)
    expect(result.dependencies).toHaveLength(0)
  })

  it('returns empty dependencies when table has no rows', () => {
    const content = `## Section 1: Independent

- [ ] \`src/a.ts\` — File A

## Section Dependencies

> How sections connect.

| From | To | Relationship |
|------|-----|-------------|

---

## File Index
`
    const result = parseMapMd(content)
    expect(result.dependencies).toHaveLength(0)
  })

  it('does not treat Section Dependencies as a review section', () => {
    const content = `## Section 1: Real Section

- [ ] \`src/file.ts\` — A file

## Section Dependencies

| From | To | Relationship |
|------|-----|-------------|
| 1: Real Section | 2: Other | Calls other |

## File Index
`
    const result = parseMapMd(content)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]?.title).toBe('Real Section')
  })
})
