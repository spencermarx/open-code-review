import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, Terminal } from 'lucide-react'
import { useSocket } from '../../../providers/socket-provider'
import { cn } from '../../../lib/utils'
import { useHandoff } from '../hooks/use-agent-sessions'
import { TerminalHandoffPanel } from './terminal-handoff-panel'

type ResumeCardProps = {
  workflowId: string
  variant?: 'paused' | 'completed'
}

/**
 * Action card surfaced on the session detail page when a workflow is
 * stalled, orphaned, or completed-but-resumable. Offers two affordances:
 *
 *   1. **Continue here** — re-spawns the AI CLI inside the dashboard via
 *      the existing `command:run` socket event with `--resume <workflow-id>`,
 *      then navigates to the Command Center to watch live output.
 *   2. **Pick up in terminal** — opens the terminal-handoff panel (Spec 5).
 */
export function ResumeCard({ workflowId, variant = 'paused' }: ResumeCardProps) {
  const { socket } = useSocket()
  const navigate = useNavigate()
  const [handoffOpen, setHandoffOpen] = useState(false)
  const handoff = useHandoff(handoffOpen ? workflowId : undefined)

  const continueDisabled = !socket
  const continueHere = useCallback(() => {
    if (!socket) return
    socket.emit('command:run', { command: `review --resume ${workflowId}` })
    navigate('/')
  }, [socket, workflowId, navigate])

  const headline =
    variant === 'completed'
      ? 'Continue this review where it left off.'
      : 'This review is paused.'

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {headline}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pick up the prior conversation in the dashboard or hand off to your terminal.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={continueHere}
            disabled={continueDisabled}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
              'bg-zinc-900 text-white hover:bg-zinc-800',
              'dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
              continueDisabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            <span>Continue here</span>
          </button>
          <button
            type="button"
            onClick={() => setHandoffOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition',
              'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              'dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50',
            )}
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            <span>Pick up in terminal</span>
          </button>
        </div>
      </div>

      {handoffOpen && (
        <TerminalHandoffPanel
          workflowId={workflowId}
          onClose={() => setHandoffOpen(false)}
        />
      )}

      {/* Tiny hidden label so the handoff query has a stable mount slot.
          Prefetches when the user hovers the trigger. */}
      <span className="sr-only">{handoff.data ? 'handoff ready' : ''}</span>
    </>
  )
}
