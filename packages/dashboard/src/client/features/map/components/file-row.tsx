import { FileText, Plus, Minus, ExternalLink } from 'lucide-react'
import { cn, buildIdeLink } from '../../../lib/utils'
import { useIdeConfig } from '../../../hooks/use-ide-config'
import type { MapFile } from '../../../lib/api-types'

type FileRowProps = {
  file: MapFile
  onToggle: (isReviewed: boolean) => void
  highlighted?: boolean
}

export function FileRow({ file, onToggle, highlighted }: FileRowProps) {
  const { data: config } = useIdeConfig()

  return (
    <label
      data-file-id={file.id}
      className={cn(
        'group flex cursor-pointer items-center gap-3 px-4 py-2.5 pl-11 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50',
        highlighted && 'bg-indigo-50 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/30 dark:ring-indigo-800',
      )}
    >
      <input
        type="checkbox"
        checked={file.is_reviewed}
        onChange={(e) => onToggle(e.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600 dark:bg-zinc-800"
      />

      <FileText className="h-4 w-4 shrink-0 text-zinc-400" />

      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {config ? (
            <a
              href={buildIdeLink(config.ide, config.projectRoot, file.file_path)}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                'truncate text-sm font-mono hover:underline',
                file.is_reviewed
                  ? 'text-zinc-400 line-through dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-100',
              )}
              title={`Open in ${config.ide}`}
            >
              {file.file_path}
            </a>
          ) : (
            <span
              className={cn(
                'truncate text-sm font-mono',
                file.is_reviewed
                  ? 'text-zinc-400 line-through dark:text-zinc-500'
                  : 'text-zinc-900 dark:text-zinc-100',
              )}
            >
              {file.file_path}
            </span>
          )}
          {config && (
            <ExternalLink className="h-3 w-3 shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </span>
        {file.role && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {file.role}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs tabular-nums">
        {file.lines_added > 0 && (
          <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
            <Plus className="h-3 w-3" />
            {file.lines_added}
          </span>
        )}
        {file.lines_deleted > 0 && (
          <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400">
            <Minus className="h-3 w-3" />
            {file.lines_deleted}
          </span>
        )}
      </div>
    </label>
  )
}
