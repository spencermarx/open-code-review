import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '../../../providers/socket-provider'
import { fetchApi } from '../../../lib/utils'
import type { SessionSummary } from '../../../lib/api-types'

export function useSessions() {
  const queryClient = useQueryClient()

  const query = useQuery<SessionSummary[]>({
    queryKey: ['sessions'],
    queryFn: () => fetchApi<SessionSummary[]>('/api/sessions'),
  })

  useSocketEvent('session:created', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  useSocketEvent('session:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] })
  })

  return query
}

export function useSession(id: string) {
  const queryClient = useQueryClient()

  const query = useQuery<SessionSummary>({
    queryKey: ['sessions', id],
    queryFn: () => fetchApi<SessionSummary>(`/api/sessions/${id}`),
    enabled: !!id,
  })

  useSocketEvent('session:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['sessions', id] })
  })

  return query
}
