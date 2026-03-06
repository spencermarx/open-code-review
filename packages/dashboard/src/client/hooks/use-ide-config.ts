import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/utils'
import type { IdeType } from '../lib/utils'

export type AiCliStatus = {
  available: string[]
  active: string | null
  preferred: string
}

type IdeConfig = {
  projectRoot: string
  ide: IdeType
  workspaceName: string
  gitBranch: string | null
  aiCli: AiCliStatus
}

export function useIdeConfig() {
  return useQuery<IdeConfig>({
    queryKey: ['config'],
    queryFn: () => fetchApi<IdeConfig>('/api/config'),
    staleTime: Infinity,
  })
}
