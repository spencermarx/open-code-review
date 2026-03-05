import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/utils'
import type { IdeType } from '../lib/utils'

interface IdeConfig {
  projectRoot: string
  ide: IdeType
}

export function useIdeConfig() {
  return useQuery<IdeConfig>({
    queryKey: ['config'],
    queryFn: () => fetchApi<IdeConfig>('/api/config'),
    staleTime: Infinity,
  })
}
