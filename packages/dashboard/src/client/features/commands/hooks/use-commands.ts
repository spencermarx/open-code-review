import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../../../lib/utils'

export type CommandHistoryEntry = {
  id: string
  command: string
  args: string | null
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  exit_code: number | null
  output: string
}

export function useCommandHistory() {
  return useQuery<CommandHistoryEntry[]>({
    queryKey: ['command-history'],
    queryFn: () => fetchApi<CommandHistoryEntry[]>('/api/commands/history'),
  })
}
