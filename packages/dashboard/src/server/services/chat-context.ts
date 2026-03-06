/**
 * Chat context builder.
 *
 * Reads on-disk OCR session artifacts and formats them as context
 * for Claude chat conversations. Supports both map runs and review rounds.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type ChatTarget =
  | { type: 'map_run'; sessionId: string; runNumber: number }
  | { type: 'review_round'; sessionId: string; roundNumber: number }

/**
 * Build a formatted context string from on-disk OCR artifacts.
 *
 * For map runs, reads the map.md file.
 * For review rounds, reads final.md and all reviewer markdown files.
 */
export function buildChatContext(ocrDir: string, target: ChatTarget): string {
  const sessionsDir = join(ocrDir, 'sessions')

  if (target.type === 'map_run') {
    return buildMapRunContext(sessionsDir, target.sessionId, target.runNumber)
  }

  return buildReviewRoundContext(sessionsDir, target.sessionId, target.roundNumber)
}

function buildMapRunContext(
  sessionsDir: string,
  sessionId: string,
  runNumber: number
): string {
  const mapPath = join(
    sessionsDir,
    sessionId,
    'map',
    'runs',
    `run-${runNumber}`,
    'map.md'
  )

  const parts: string[] = [
    `You are an expert code reviewer assisting with a code review session.`,
    `You are looking at map run #${runNumber} for session "${sessionId}".`,
    '',
    `Below is the Code Review Map that organizes the changeset into reviewable sections:`,
  ]

  if (existsSync(mapPath)) {
    const content = readFileSync(mapPath, 'utf-8')
    parts.push('')
    parts.push('<map>')
    parts.push(content)
    parts.push('</map>')
  } else {
    parts.push('')
    parts.push('(Map file not found on disk.)')
  }

  return parts.join('\n')
}

function buildReviewRoundContext(
  sessionsDir: string,
  sessionId: string,
  roundNumber: number
): string {
  const roundDir = join(sessionsDir, sessionId, 'rounds', `round-${roundNumber}`)
  const finalPath = join(roundDir, 'final.md')
  const reviewersDir = join(roundDir, 'reviews')

  const parts: string[] = [
    `You are an expert code reviewer assisting with a code review session.`,
    `You are looking at review round #${roundNumber} for session "${sessionId}".`,
    '',
    `Below are the review artifacts for this round:`,
  ]

  // Final synthesis
  if (existsSync(finalPath)) {
    const content = readFileSync(finalPath, 'utf-8')
    parts.push('')
    parts.push('<final-synthesis>')
    parts.push(content)
    parts.push('</final-synthesis>')
  }

  // Individual reviewer outputs
  if (existsSync(reviewersDir)) {
    const files = readdirSync(reviewersDir)
      .filter((f) => f.endsWith('.md'))
      .sort()

    for (const file of files) {
      const content = readFileSync(join(reviewersDir, file), 'utf-8')
      const reviewerName = file.replace(/\.md$/, '')
      parts.push('')
      parts.push(`<reviewer name="${reviewerName}">`)
      parts.push(content)
      parts.push('</reviewer>')
    }
  }

  if (!existsSync(finalPath) && !existsSync(reviewersDir)) {
    parts.push('')
    parts.push('(No review artifacts found on disk for this round.)')
  }

  return parts.join('\n')
}
