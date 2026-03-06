import { useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { cn, buildIdeLink } from '../../../lib/utils'
import { useIdeConfig } from '../../../hooks/use-ide-config'
import { StatusBadge } from '../../../components/ui/status-badge'
import { MarkdownRenderer } from '../../../components/markdown/markdown-renderer'
import type { Finding, FindingTriage } from '../../../lib/api-types'

const TRIAGE_OPTIONS: { value: FindingTriage; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'fixed', label: 'Fixed' },
  { value: 'wont_fix', label: "Won't Fix" },
]

type FindingRowProps = {
  finding: Finding
  onTriageChange: (findingId: number, status: FindingTriage) => void
}

export function FindingRow({ finding, onTriageChange }: FindingRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: config } = useIdeConfig()

  const toggle = useCallback(() => setExpanded((v) => !v), [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    },
    [toggle],
  )

  const lineRange =
    finding.line_start != null
      ? finding.line_end != null && finding.line_end !== finding.line_start
        ? `${finding.line_start}-${finding.line_end}`
        : String(finding.line_start)
      : '-'

  return (
    <>
      <tr
        tabIndex={0}
        role="row"
        aria-expanded={expanded}
        className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <td className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          <div className="flex items-center gap-1">
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform',
                expanded && 'rotate-90',
              )}
            />
            <StatusBadge variant={finding.severity} />
          </div>
        </td>
        <td className="border-b border-zinc-200 px-4 py-2 text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">
          {finding.title}
        </td>
        <td className="border-b border-zinc-200 px-4 py-2 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {finding.file_path && config ? (
            <a
              href={buildIdeLink(config.ide, config.projectRoot, finding.file_path, finding.line_start)}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-200"
              title={`Open in ${config.ide}`}
            >
              {finding.file_path}
              <ExternalLink className="ml-1 inline h-3 w-3" />
            </a>
          ) : (
            finding.file_path ?? '-'
          )}
        </td>
        <td className="border-b border-zinc-200 px-4 py-2 tabular-nums text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {finding.file_path && config && finding.line_start != null ? (
            <a
              href={buildIdeLink(config.ide, config.projectRoot, finding.file_path, finding.line_start)}
              onClick={(e) => e.stopPropagation()}
              className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-200"
            >
              {lineRange}
            </a>
          ) : (
            lineRange
          )}
        </td>
        <td className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
          {finding.is_blocker ? (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Yes
            </span>
          ) : (
            <span className="text-xs text-zinc-400">No</span>
          )}
        </td>
        <td
          className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
          <select
            value={finding.progress?.status ?? 'unread'}
            onChange={(e) =>
              onTriageChange(finding.id, e.target.value as FindingTriage)
            }
            aria-label={`Triage status for ${finding.title}`}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            {TRIAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </td>
      </tr>
      {expanded && finding.summary && (
        <tr>
          <td
            colSpan={6}
            className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50"
          >
            <MarkdownRenderer
              content={finding.summary}
              className="text-sm"
            />
          </td>
        </tr>
      )}
    </>
  )
}
