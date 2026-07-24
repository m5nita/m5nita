import type { MyPerformanceResponse } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'

/** Global per-user performance overview ("Meu desempenho"). */
export function useMyPerformance() {
  return useQuery({
    queryKey: ['my-performance'],
    queryFn: async (): Promise<MyPerformanceResponse> => {
      const res = await apiFetch('/api/users/me/performance')
      if (!res.ok) throw new Error('Erro ao carregar seu desempenho')
      return res.json()
    },
  })
}
