import { useMemo, useState } from 'react'
import { useSessions } from './hooks/use-sessions'
import { SessionFilters } from './components/session-filters'
import { SessionList } from './components/session-list'
import type { SessionStatus, WorkflowType } from '../../lib/api-types'

export function SessionsPage() {
  const { data: sessions, isLoading } = useSessions()
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all')
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowType | 'all'>('all')

  const filtered = useMemo(() => {
    if (!sessions) return []
    return sessions.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (workflowFilter !== 'all' && s.workflow_type !== workflowFilter) return false
      return true
    })
  }, [sessions, statusFilter, workflowFilter])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          All code review and map sessions.
        </p>
      </div>

      <SessionFilters
        statusFilter={statusFilter}
        workflowFilter={workflowFilter}
        onStatusChange={setStatusFilter}
        onWorkflowChange={setWorkflowFilter}
      />

      {isLoading ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading sessions...</p>
      ) : (
        <SessionList sessions={filtered} />
      )}
    </div>
  )
}
