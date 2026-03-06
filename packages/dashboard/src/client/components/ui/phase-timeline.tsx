import { Check, Circle, Loader2, Minus } from 'lucide-react'
import { cn } from '../../lib/utils'

export type PhaseStatus = 'pending' | 'active' | 'complete' | 'skipped'

export type Phase = {
  name: string
  status: PhaseStatus
  timestamp?: string
}

type PhaseTimelineProps = {
  phases: Phase[]
  className?: string
}

export function PhaseTimeline({ phases, className }: PhaseTimelineProps) {
  return (
    <div role="list" aria-label="Phase timeline" className={cn('flex items-center gap-1', className)}>
      {phases.map((phase, i) => (
        <div key={phase.name} className="flex items-center gap-1">
          <PhaseNode phase={phase} />
          {i < phases.length - 1 && (
            <div
              className={cn(
                'h-px w-6',
                phase.status === 'complete' && phases[i + 1]?.status !== 'skipped'
                  ? 'bg-emerald-500'
                  : 'bg-zinc-300 dark:bg-zinc-700',
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}

function PhaseNode({ phase }: { phase: Phase }) {
  return (
    <div className="group relative flex flex-col items-center">
      <div
        tabIndex={0}
        role="listitem"
        aria-label={`${phase.name}: ${phase.status}${phase.timestamp ? `, ${phase.timestamp}` : ''}`}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full border',
          phase.status === 'complete' &&
            'border-emerald-500 bg-emerald-500 text-white',
          phase.status === 'active' &&
            'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400',
          phase.status === 'pending' &&
            'border-zinc-300 bg-zinc-100 text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-500',
          phase.status === 'skipped' &&
            'border-zinc-200 bg-zinc-50 text-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-600',
        )}
      >
        {phase.status === 'complete' && <Check className="h-3.5 w-3.5" />}
        {phase.status === 'active' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {phase.status === 'pending' && <Circle className="h-2.5 w-2.5" />}
        {phase.status === 'skipped' && <Minus className="h-3 w-3" />}
      </div>
      <div className="pointer-events-none absolute top-8 hidden whitespace-nowrap rounded bg-zinc-900 px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus-within:block dark:bg-zinc-100 dark:text-zinc-900">
        <span className="font-medium">{phase.name}</span>
        {phase.timestamp && (
          <span className="ml-1 text-zinc-400 dark:text-zinc-500">
            {phase.timestamp}
          </span>
        )}
      </div>
    </div>
  )
}
