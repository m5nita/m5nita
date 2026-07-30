import type { PendingPrize, PendingPrizesResponse } from '@m5nita/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import { PrizeWithdrawalForm } from '../pool/PrizeWithdrawalForm'
import { WithdrawalStatusCard } from '../pool/WithdrawalStatusCard'
import { Button } from '../ui/Button'

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
          Seus prêmios
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {items.map((item) =>
        item.withdrawal ? (
          <WithdrawalStatusCard
            key={item.poolId}
            poolName={item.poolName}
            amount={item.withdrawal.amount}
            pixKey={item.withdrawal.pixKey}
            status={item.withdrawal.status}
            requestedAt={item.withdrawal.requestedAt}
          />
        ) : (
          <PendingPrizeCard
            key={item.poolId}
            item={item}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['pending-prizes'] })
              queryClient.invalidateQueries({ queryKey: ['prize', item.poolId] })
            }}
          />
        ),
      )}
    </section>
  )
}

function PendingPrizeCard({ item, onSuccess }: { item: PendingPrize; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-l-4 border-green bg-green/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-black truncate">
            {item.poolName}
          </p>
          <p className="text-[11px] text-gray-muted">Prêmio disponível</p>
        </div>
        <p className="font-display text-3xl font-black leading-none text-green whitespace-nowrap">
          {formatCurrency(item.winnerShare)}
        </p>
      </div>
      <Button
        variant={open ? 'secondary' : 'success'}
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 w-full"
      >
        {open ? 'Fechar' : 'Solicitar retirada'}
      </Button>
      {open && (
        <div className="mt-4">
          <PrizeWithdrawalForm poolId={item.poolId} onSuccess={onSuccess} />
        </div>
      )}
    </div>
  )
}
