import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../../../lib/utils'

export type Note = {
  id: string
  target_type: string
  target_id: string
  content: string
  created_at: string
  updated_at: string
}

export function useNotes(targetType: string, targetId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['notes', targetType, targetId]

  const query = useQuery<Note[]>({
    queryKey,
    queryFn: () =>
      fetchApi<Note[]>(`/api/notes?target_type=${encodeURIComponent(targetType)}&target_id=${encodeURIComponent(targetId)}`),
    enabled: !!targetType && !!targetId,
  })

  const createMutation = useMutation({
    mutationFn: (content: string) =>
      fetchApi('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_type: targetType, target_id: targetId, content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      fetchApi(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
    },
  })

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    createNote: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateNote: (id: string, content: string) => updateMutation.mutateAsync({ id, content }),
    isUpdating: updateMutation.isPending,
    deleteNote: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
