import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { authHeaders } from './auth'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Fetch wrapper that throws on non-OK responses so TanStack Query
 * properly treats HTTP errors as errors instead of caching the
 * error body as valid data.
 *
 * Automatically injects the Authorization bearer token header.
 */
export async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status}: ${body || res.statusText}`)
  }
  return res.json()
}

/**
 * Parse a UTC timestamp from SQLite or JS into a proper Date.
 *
 * SQLite's `datetime('now')` returns `YYYY-MM-DD HH:MM:SS` without timezone.
 * JavaScript's `new Date()` treats that as local time, causing an offset.
 * This function ensures the string is interpreted as UTC.
 */
export function parseUtcDate(dateStr: string): Date {
  // Already has timezone info (Z, +HH:MM, -HH:MM) — parse as-is
  if (/[Zz]$/.test(dateStr) || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr)
  }
  // SQLite format: "YYYY-MM-DD HH:MM:SS" → append Z and fix separator
  return new Date(dateStr.replace(' ', 'T') + 'Z')
}

export type IdeType = 'vscode' | 'cursor' | 'windsurf' | 'jetbrains' | 'sublime'

export function buildIdeLink(
  ide: IdeType,
  projectRoot: string,
  filePath: string,
  lineStart?: number | null,
  colStart?: number | null,
): string {
  const absPath = filePath.startsWith('/') ? filePath : `${projectRoot}/${filePath}`
  // Strip leading slash — protocol URIs supply their own (e.g. vscode://file/ + path)
  const uriPath = absPath.replace(/^\//, '')
  const line = lineStart ?? 1
  const col = colStart ?? 1

  switch (ide) {
    case 'vscode':
      return `vscode://file/${uriPath}:${line}:${col}`
    case 'cursor':
      return `cursor://file/${uriPath}:${line}:${col}`
    case 'windsurf':
      return `windsurf://file/${uriPath}:${line}:${col}`
    case 'jetbrains':
      return `jetbrains://open?file=${encodeURIComponent(absPath)}&line=${line}`
    case 'sublime':
      return `subl://open?url=file://${encodeURIComponent(absPath)}&line=${line}`
  }
}
