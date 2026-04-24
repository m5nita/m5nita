import type { PendingPrizesResponse } from '@m5nita/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import { PrizeWithdrawalForm } from '../pool/PrizeWithdrawalForm'

export function PendingPrizesSection() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pending-prizes'],
    queryFn: async (): Promise<PendingPrizesResponse> => {
      const res = await apiFetch('/api/users/me/pending-prizes')
      if (!res.ok) throw new Error('Erro ao carregar prêmios')
      return res.json()
    },
  })

  const items = data?.items ?? []
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Prêmios a retirar
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {items.map((item) => (
        <PendingPrizeCard
          key={item.poolId}
          poolId={item.poolId}
          poolName={item.poolName}
          winnerShare={item.winnerShare}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['pending-prizes'] })
            queryClient.invalidateQueries({ queryKey: ['prize', item.poolId] })
          }}
        />
      ))}
    </section>
  )
}

function PendingPrizeCard({
  poolId,
  poolName,
  winnerShare,
  onSuccess,
}: {
  poolId: string
  poolName: string
  winnerShare: number
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-l-4 border-green bg-green/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-black truncate">
            {poolName}
          </p>
          <p className="text-[11px] text-gray-muted">Prêmio disponível</p>
        </div>
        <p className="font-display text-lg font-black text-green">{formatCurrency(winnerShare)}</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 font-display text-[11px] font-bold uppercase tracking-widest text-black underline underline-offset-4 hover:text-red transition-colors cursor-pointer"
      >
        {open ? 'Fechar' : 'Solicitar retirada'}
      </button>
      {open && (
        <div className="mt-4">
          <PrizeWithdrawalForm poolId={poolId} onSuccess={onSuccess} />
        </div>
      )}
    </div>
  )
}
