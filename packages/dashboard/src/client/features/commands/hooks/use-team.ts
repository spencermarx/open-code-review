import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../../lib/utils'
import { authHeaders } from '../../../lib/auth'
import type {
  ModelListResponse,
  ReviewerInstance,
  TeamResolvedResponse,
} from '../../../lib/api-types'

export function useResolvedTeam(override?: ReviewerInstance[]) {
  const overrideKey = override ? JSON.stringify(override) : null
  return useQuery<TeamResolvedResponse>({
    queryKey: ['team', 'resolved', overrideKey ?? 'disk'],
    queryFn: () => {
      const url = overrideKey
        ? `/api/team/resolved?override=${encodeURIComponent(overrideKey)}`
        : '/api/team/resolved'
      return fetchApi<TeamResolvedResponse>(url)
    },
    staleTime: 5_000,
  })
}

export function useAvailableModels(vendor?: string) {
  return useQuery<ModelListResponse>({
    queryKey: ['models', vendor ?? 'auto'],
    queryFn: () =>
      fetchApi<ModelListResponse>(
        vendor
          ? `/api/team/models?vendor=${encodeURIComponent(vendor)}`
          : '/api/team/models',
      ),
    staleTime: 60_000,
  })
}

export function useSetDefaultTeam() {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, ReviewerInstance[]>({
    mutationFn: async (team) => {
      const res = await fetch('/api/team/default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ team }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status}: ${body || res.statusText}`)
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] })
      queryClient.invalidateQueries({ queryKey: ['reviewers'] })
    },
  })
}
