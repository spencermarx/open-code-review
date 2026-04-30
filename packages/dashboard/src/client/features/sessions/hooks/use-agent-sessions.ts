import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '../../../providers/socket-provider'
import { fetchApi } from '../../../lib/utils'
import type { AgentSessionRow, AgentSessionsResponse, HandoffPayload } from '../../../lib/api-types'

export function useAgentSessions(workflowId: string | undefined) {
  const queryClient = useQueryClient()

  const query = useQuery<AgentSessionsResponse>({
    queryKey: ['agent-sessions', workflowId],
    queryFn: () =>
      fetchApi<AgentSessionsResponse>(
        `/api/agent-sessions?workflow=${encodeURIComponent(workflowId ?? '')}`,
      ),
    enabled: !!workflowId,
    refetchInterval: 15_000,
  })

  useSocketEvent('agent_session:updated', (payload: { workflow_ids?: string[] }) => {
    if (!workflowId) return
    if (!payload?.workflow_ids || payload.workflow_ids.includes(workflowId)) {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', workflowId] })
    }
  })

  return query
}

export function useHandoff(workflowId: string | undefined) {
  return useQuery<HandoffPayload>({
    queryKey: ['handoff', workflowId],
    queryFn: () =>
      fetchApi<HandoffPayload>(
        `/api/sessions/${encodeURIComponent(workflowId ?? '')}/handoff`,
      ),
    enabled: !!workflowId,
    staleTime: 5_000,
  })
}

export type AgentLiveness = 'running' | 'stalled' | 'orphaned' | 'idle'

const HEARTBEAT_FRESH_MS = 60_000

/**
 * Classify a workflow's overall liveness from its child agent_sessions rows.
 *
 * - `running`  — at least one row in 'running' status with a fresh heartbeat
 * - `stalled`  — has 'running' rows but their heartbeat is past threshold
 * - `orphaned` — at least one row reclassified to 'orphaned'; no live rows
 * - `idle`     — no active or orphaned rows (workflow may be fresh or completed)
 */
export function classifyLiveness(rows: AgentSessionRow[]): {
  status: AgentLiveness
  newestHeartbeat: string | null
  liveRow: AgentSessionRow | null
  orphanedRow: AgentSessionRow | null
} {
  if (rows.length === 0) {
    return { status: 'idle', newestHeartbeat: null, liveRow: null, orphanedRow: null }
  }

  const now = Date.now()
  let newestRunningRow: AgentSessionRow | null = null
  let newestRunningTime = -Infinity
  let newestOrphanedRow: AgentSessionRow | null = null
  let newestOrphanedTime = -Infinity
  let newestHeartbeatStr: string | null = null
  let newestHeartbeatTime = -Infinity

  for (const row of rows) {
    const t = parseSqlTime(row.last_heartbeat_at)
    if (t > newestHeartbeatTime) {
      newestHeartbeatTime = t
      newestHeartbeatStr = row.last_heartbeat_at
    }
    if (row.status === 'running' && t > newestRunningTime) {
      newestRunningTime = t
      newestRunningRow = row
    }
    if (row.status === 'orphaned' && t > newestOrphanedTime) {
      newestOrphanedTime = t
      newestOrphanedRow = row
    }
  }

  if (newestRunningRow) {
    const fresh = now - newestRunningTime <= HEARTBEAT_FRESH_MS
    return {
      status: fresh ? 'running' : 'stalled',
      newestHeartbeat: newestHeartbeatStr,
      liveRow: newestRunningRow,
      orphanedRow: null,
    }
  }
  if (newestOrphanedRow) {
    return {
      status: 'orphaned',
      newestHeartbeat: newestHeartbeatStr,
      liveRow: null,
      orphanedRow: newestOrphanedRow,
    }
  }
  return {
    status: 'idle',
    newestHeartbeat: newestHeartbeatStr,
    liveRow: null,
    orphanedRow: null,
  }
}

function parseSqlTime(s: string): number {
  // SQLite emits "YYYY-MM-DD HH:MM:SS" UTC without timezone; treat as UTC.
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return new Date(s).getTime()
  return new Date(s.replace(' ', 'T') + 'Z').getTime()
}
