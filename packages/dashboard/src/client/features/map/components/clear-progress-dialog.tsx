import { useState, useEffect, useRef, useCallback } from 'react'
import { Trash2, X } from 'lucide-react'
import { cn } from '../../../lib/utils'

type ClearProgressDialogProps = {
  onConfirm: () => void
  isPending: boolean
}

export function ClearProgressDialog({ onConfirm, isPending }: ClearProgressDialogProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, close])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Clear Progress
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-progress-title"
            tabIndex={-1}
            className="relative z-10 w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <button
              onClick={close}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>

            <h3 id="clear-progress-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Clear all progress?
            </h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              This will uncheck all reviewed files for this map run. This action
              cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm()
                  setOpen(false)
                }}
                disabled={isPending}
                className={cn(
                  'rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700',
                  isPending && 'cursor-not-allowed opacity-50',
                )}
              >
                {isPending ? 'Clearing...' : 'Clear Progress'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
