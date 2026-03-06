import { parseUtcDate } from './utils'

/**
 * Format an ISO/SQLite date string as a full localized date.
 *
 * Example output: "Jan 5, 2025, 02:30 PM"
 */
export function formatDate(iso: string): string {
  return parseUtcDate(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format an ISO/SQLite date string as a short date with time (no year).
 *
 * Example output: "Jan 5, 02:30 PM"
 */
export function formatShortDate(iso: string): string {
  return parseUtcDate(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format an ISO/SQLite date string as a full localized date+time string.
 *
 * Example output: "1/5/2025, 2:30:00 PM"
 */
export function formatDateTime(iso: string): string {
  return parseUtcDate(iso).toLocaleString()
}

/**
 * Return a human-readable relative time string (e.g. "just now", "5m ago").
 *
 * Uses `parseUtcDate` to correctly interpret SQLite timestamps as UTC,
 * avoiding the off-by-timezone bug that occurs with bare `new Date()`.
 */
export function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - parseUtcDate(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Format elapsed time since a given UTC timestamp (e.g. "5s", "3m", "2h").
 */
export function formatElapsed(startedAt: string): string {
  const ms = Date.now() - parseUtcDate(startedAt).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
