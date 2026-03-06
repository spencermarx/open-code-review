import { X, Ban, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { CommandTab } from '../../../providers/command-state-provider'

type TabBarProps = {
  tabs: CommandTab[]
  activeTabId: number | null
  onSelectTab: (id: number) => void
  onDismissTab: (id: number) => void
}

export function TabBar({ tabs, activeTabId, onSelectTab, onDismissTab }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-zinc-50 px-2 dark:border-zinc-800 dark:bg-zinc-900">
      {tabs.map((tab) => {
        const isActive = tab.executionId === activeTabId
        const label = tab.command.replace(/^ocr\s+/, '').split(/\s+/)[0] ?? 'command'

        return (
          <button
            key={tab.executionId}
            type="button"
            onClick={() => onSelectTab(tab.executionId)}
            className={cn(
              'group relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'border-b-2 border-indigo-500 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
            )}
          >
            {tab.status === 'running' ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-500" />
              </span>
            ) : tab.status === 'complete' ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : tab.status === 'cancelled' ? (
              <Ban className="h-3 w-3 text-amber-500" />
            ) : (
              <XCircle className="h-3 w-3 text-red-500" />
            )}

            <span className="capitalize">{label}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500">#{tab.executionId}</span>

            {tab.status !== 'running' && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onDismissTab(tab.executionId)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    onDismissTab(tab.executionId)
                  }
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-zinc-200 group-hover:opacity-100 dark:hover:bg-zinc-700"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
