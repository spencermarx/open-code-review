import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '../../../providers/socket-provider'
import { fetchApi } from '../../../lib/utils'
import type { MapRun, Artifact } from '../../../lib/api-types'

export function useMapRun(sessionId: string, runNumber: number) {
  const queryClient = useQueryClient()
  const queryKey = ['sessions', sessionId, 'runs', runNumber]

  const query = useQuery<MapRun>({
    queryKey,
    queryFn: () =>
      fetchApi<MapRun>(`/api/sessions/${sessionId}/runs/${runNumber}`),
    enabled: !!sessionId && runNumber > 0,
  })

  useSocketEvent('artifact:updated', () => {
    queryClient.invalidateQueries({ queryKey })
  })

  return query
}

export function useMapArtifact(sessionId: string) {
  return useQuery<Artifact>({
    queryKey: ['sessions', sessionId, 'artifacts', 'map'],
    queryFn: () =>
      fetchApi<Artifact>(`/api/sessions/${sessionId}/artifacts/map`),
    enabled: !!sessionId,
  })
}

export function useToggleFileReview(sessionId: string, runNumber: number) {
  const queryClient = useQueryClient()
  const queryKey = ['sessions', sessionId, 'runs', runNumber]

  return useMutation({
    mutationFn: async ({
      fileId,
      isReviewed,
    }: {
      fileId: number
      isReviewed: boolean
    }) => {
      return fetchApi(`/api/map-files/${fileId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_reviewed: isReviewed }),
      })
    },
    onMutate: async ({ fileId, isReviewed }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<MapRun>(queryKey)
      if (previous) {
        queryClient.setQueryData<MapRun>(queryKey, {
          ...previous,
          sections: previous.sections.map((section) => ({
            ...section,
            reviewed_count: section.files.some((f) => f.id === fileId)
              ? section.reviewed_count + (isReviewed ? 1 : -1)
              : section.reviewed_count,
            files: section.files.map((f) =>
              f.id === fileId
                ? { ...f, is_reviewed: isReviewed, reviewed_at: isReviewed ? new Date().toISOString() : null }
                : f,
            ),
          })),
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })
}

export function useClearMapProgress(sessionId: string, runNumber: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (runId: number) => {
      return fetchApi(`/api/map-runs/${runId}/progress`, {
        method: 'DELETE',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['sessions', sessionId, 'runs', runNumber],
      })
    },
  })
}
