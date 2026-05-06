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
 * Action card on the session detail page. Two variants:
 *
 *   - `paused` (stalled/orphaned): the run crashed or stalled. The user
 *     gets BOTH:
 *       1. **Continue from where you left off** — primary, dashboard-fired
 *          recovery. Re-spawns the AI CLI via the `command:run` socket
 *          event with `--resume <workflow-id>` and navigates to the
 *          Command Center to watch the resumed run live. This is the
 *          "the dashboard saw your run die, click to bring it back" path.
 *       2. **Resume in terminal** — secondary, manual hand-off. Opens the
 *          terminal-handoff panel with copyable resume commands.
 *
 *   - `completed` (clean done state): the run finished normally. Only the
 *     manual hand-off is offered — the dashboard does NOT fire a fresh
 *     `--resume` from the user's behalf in the success case. The user
 *     copies a command and runs it in their own terminal. This keeps the
 *     dashboard in its viewer/command-copier role rather than creeping
 *     into orchestration.
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

  const isPaused = variant === 'paused'
  const headline = isPaused
    ? 'This review is paused.'
    : 'Continue this review in your terminal.'
  const subline = isPaused
    ? 'Bring the AI back where it left off, or hand off the resume command to your terminal.'
    : 'Copy the resume command and pick up the AI conversation in your own terminal.'

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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{subline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isPaused && (
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
              <span>Continue from where you left off</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setHandoffOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition',
              // For the completed variant, the terminal hand-off IS the
              // primary action — promote it to the filled style so the
              // single button reads as the page's primary CTA.
              isPaused
                ? 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/50'
                : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200',
            )}
          >
            <Terminal className="h-3.5 w-3.5" aria-hidden />
            <span>Resume in terminal</span>
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
