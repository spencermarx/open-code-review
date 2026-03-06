import { useState, useEffect, useRef, useCallback } from 'react'
import { FileCode, X } from 'lucide-react'
import { MarkdownRenderer } from '../../../components/markdown'
import { useMapArtifact } from '../hooks/use-map-run'

type RawMapViewProps = {
  sessionId: string
}

export function RawMapView({ sessionId }: RawMapViewProps) {
  const [open, setOpen] = useState(false)
  const { data: artifact, isLoading } = useMapArtifact(sessionId)
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
        <FileCode className="h-3.5 w-3.5" />
        View Raw Map
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={close}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="raw-map-title"
            tabIndex={-1}
            className="relative z-10 flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 id="raw-map-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Raw Map Output
              </h3>
              <button
                onClick={close}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {isLoading ? (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Loading map content...
                </p>
              ) : artifact?.content ? (
                <MarkdownRenderer content={artifact.content} />
              ) : (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  No map content available.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
