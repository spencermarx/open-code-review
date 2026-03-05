import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from '../../../providers/socket-provider'
import { fetchApi } from '../../../lib/utils'
import type {
  ReviewRound,
  Finding,
  ReviewerOutputDetail,
  Artifact,
  FindingTriage,
  RoundTriage,
} from '../../../lib/api-types'

export function useAllReviews() {
  const queryClient = useQueryClient()

  useSocketEvent('artifact:created', () => {
    queryClient.invalidateQueries({ queryKey: ['reviews'] })
  })
  useSocketEvent('artifact:updated', () => {
    queryClient.invalidateQueries({ queryKey: ['reviews'] })
  })

  return useQuery<ReviewRound[]>({
    queryKey: ['reviews'],
    queryFn: () => fetchApi<ReviewRound[]>('/api/reviews'),
  })
}

export function useRound(sessionId: string, roundNumber: number) {
  const queryClient = useQueryClient()
  const queryKey = ['sessions', sessionId, 'rounds', roundNumber]

  const query = useQuery<ReviewRound>({
    queryKey,
    queryFn: () =>
      fetchApi<ReviewRound>(`/api/sessions/${sessionId}/rounds/${roundNumber}`),
    enabled: !!sessionId && roundNumber > 0,
  })

  useSocketEvent('artifact:created', () => {
    queryClient.invalidateQueries({ queryKey })
  })

  useSocketEvent('artifact:updated', () => {
    queryClient.invalidateQueries({ queryKey })
  })

  return query
}

export function useRoundFindings(sessionId: string, roundNumber: number) {
  const queryKey = ['sessions', sessionId, 'rounds', roundNumber, 'findings']

  return useQuery<Finding[]>({
    queryKey,
    queryFn: () =>
      fetchApi<Finding[]>(`/api/sessions/${sessionId}/rounds/${roundNumber}/findings`),
    enabled: !!sessionId && roundNumber > 0,
  })
}

export function useReviewerDetail(
  sessionId: string,
  roundNumber: number,
  reviewerId: number,
) {
  return useQuery<ReviewerOutputDetail>({
    queryKey: ['sessions', sessionId, 'rounds', roundNumber, 'reviewers', reviewerId],
    queryFn: () =>
      fetchApi<ReviewerOutputDetail>(
        `/api/sessions/${sessionId}/rounds/${roundNumber}/reviewers/${reviewerId}`,
      ),
    enabled: !!sessionId && roundNumber > 0 && reviewerId > 0,
  })
}

export function useArtifact(sessionId: string, artifactType: string) {
  return useQuery<Artifact>({
    queryKey: ['sessions', sessionId, 'artifacts', artifactType],
    queryFn: () =>
      fetchApi<Artifact>(`/api/sessions/${sessionId}/artifacts/${artifactType}`),
    enabled: !!sessionId && !!artifactType,
    retry: false,
  })
}

export function useUpdateFindingStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      findingId,
      status,
    }: {
      findingId: number
      status: FindingTriage
    }) =>
      fetchApi(`/api/findings/${findingId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}

export function useUpdateRoundStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      roundId,
      status,
    }: {
      roundId: number
      status: RoundTriage
    }) =>
      fetchApi(`/api/rounds/${roundId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}
