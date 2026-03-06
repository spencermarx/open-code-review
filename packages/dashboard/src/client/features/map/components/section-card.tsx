import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FolderOpen, FolderOpenDot } from 'lucide-react'
import { cn, buildIdeLink } from '../../../lib/utils'
import { useIdeConfig } from '../../../hooks/use-ide-config'
import { ProgressBar } from '../../../components/ui/progress-bar'
import { FileRow } from './file-row'
import type { MapSection } from '../../../lib/api-types'

type SectionCardProps = {
  section: MapSection
  onToggleFile: (fileId: number, isReviewed: boolean) => void
}

export function SectionCard({ section, onToggleFile }: SectionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [highlightedFileId, setHighlightedFileId] = useState<number | null>(null)
  const fileListRef = useRef<HTMLDivElement>(null)
  const { data: config } = useIdeConfig()

  // Scroll to and highlight the first unchecked file after expanding via "Open all"
  useEffect(() => {
    if (!expanded || highlightedFileId == null || !fileListRef.current) return

    // Wait a frame for the DOM to render the file list
    requestAnimationFrame(() => {
      const el = fileListRef.current?.querySelector(
        `[data-file-id="${highlightedFileId}"]`,
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [expanded, highlightedFileId])

  const openAllInIde = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!config || section.files.length === 0) return

      // Expand the section and highlight the first unchecked file
      setExpanded(true)
      const firstUnchecked = section.files.find((f) => !f.is_reviewed)
      setHighlightedFileId(firstUnchecked?.id ?? section.files[0]?.id ?? null)

      // Chain protocol handler calls sequentially — IDEs drop requests
      // if too many arrive at once.
      const unreviewedFiles = section.files.filter((f) => !f.is_reviewed)
      const filesToOpen = unreviewedFiles.length > 0 ? unreviewedFiles : section.files
      const urls = filesToOpen.map((file) =>
        buildIdeLink(config.ide, config.projectRoot, file.file_path),
      )

      function openNext(index: number) {
        if (index >= urls.length) return
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = urls[index]!
        document.body.appendChild(iframe)
        setTimeout(() => {
          iframe.remove()
          openNext(index + 1)
        }, 500)
      }

      openNext(0)
    },
    [config, section.files],
  )

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="mt-0.5 text-zinc-400">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {section.section_number}. {section.title}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {section.file_count} {section.file_count === 1 ? 'file' : 'files'}
            </span>
            {config && section.files.length > 0 && (
              <button
                onClick={openAllInIde}
                title={`Open all ${section.file_count} files in ${config.ide}`}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <FolderOpenDot className="h-3 w-3" />
                Open all
              </button>
            )}
          </div>

          {section.description && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {section.description}
            </p>
          )}

          <div className="mt-2">
            <ProgressBar
              value={section.reviewed_count}
              max={section.file_count}
              showLabel
              size="sm"
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div
          ref={fileListRef}
          className={cn(
            'border-t border-zinc-200 dark:border-zinc-800',
            section.files.length > 0 && 'divide-y divide-zinc-100 dark:divide-zinc-800',
          )}
        >
          {section.files.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
              No files in this section.
            </p>
          ) : (
            section.files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                highlighted={file.id === highlightedFileId}
                onToggle={(isReviewed) => {
                  onToggleFile(file.id, isReviewed)
                  // Advance highlight to next unchecked file when checking one off
                  if (isReviewed && file.id === highlightedFileId) {
                    const next = section.files.find(
                      (f) => f.id !== file.id && !f.is_reviewed,
                    )
                    setHighlightedFileId(next?.id ?? null)
                  }
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
