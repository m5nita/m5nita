import type { PrizeInfo } from '@m5nita/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { useCelebrateOnce } from '../../lib/celebrate'
import { formatCurrency } from '../../lib/utils'
import { Confetti } from '../ui/Confetti'
import { Loading } from '../ui/Loading'
import { PrizeWithdrawalForm } from './PrizeWithdrawalForm'
import { WithdrawalStatusCard } from './WithdrawalStatusCard'

interface PrizeWithdrawalProps {
  poolId: string
}

export function PrizeWithdrawal({ poolId }: PrizeWithdrawalProps) {
  const queryClient = useQueryClient()

  const {
    data: prize,
    isPending,
    error,
  } = useQuery({
    queryKey: ['prize', poolId],
    queryFn: async (): Promise<PrizeInfo> => {
      const res = await apiFetch(`/api/pools/${poolId}/prize`)
      if (!res.ok) throw new Error('Erro ao carregar informações do prêmio')
      return res.json()
    },
  })

  // Hook must be called unconditionally (Rules of Hooks), before any early return.
  const celebrateWin = useCelebrateOnce(prize?.isWinner ? `win:${poolId}` : null)

  if (isPending) return <Loading />
  if (error || !prize) return null

  return (
    <section>
      {prize.isWinner && (
        <>
          {celebrateWin && <Confetti count={120} />}
          <div className="mb-6 border-2 border-green bg-green/5 p-6 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-widest text-green">
              Você ganhou
            </p>
            <p className="mt-1 font-display text-5xl font-black leading-none text-green">
              {formatCurrency(prize.winnerShare)}
            </p>
            <p className="mt-2 text-sm text-gray-dark">
              {prize.withdrawal?.status === 'completed'
                ? 'Prêmio pago — o valor já saiu para a sua chave PIX.'
                : prize.withdrawal
                  ? 'Parabéns! O prêmio é seu — acompanhe a retirada abaixo.'
                  : 'Parabéns! Informe sua chave PIX abaixo para receber o prêmio.'}
            </p>
          </div>
        </>
      )}
      {/* Non-winners see who won; the winner's own "Você ganhou" hero already
          carries this, so the list is hidden for them (avoids the redundancy). */}
      {!prize.isWinner && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Bolão finalizado
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex flex-col mb-6">
            {prize.winners.map((w) => (
              <div
                key={w.userId}
                className="flex items-center justify-between py-3 border-b border-border"
              >
                <div>
                  <p className="font-display text-xs font-bold uppercase tracking-wide text-black">
                    {w.name || 'Anônimo'}
                  </p>
                  <p className="text-[10px] text-gray-muted">
                    {w.totalPoints} pts · {w.exactMatches} exatos
                  </p>
                </div>
                <p className="font-display text-2xl font-black leading-none text-green whitespace-nowrap">
                  {formatCurrency(prize.winnerShare)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {prize.isWinner && !prize.withdrawal && (
        <div className="flex flex-col gap-4 border-l-4 border-green bg-green/5 p-4">
          <PrizeWithdrawalForm
            poolId={poolId}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['prize', poolId] })
              queryClient.invalidateQueries({ queryKey: ['pending-prizes'] })
            }}
          />
        </div>
      )}

      {prize.isWinner && prize.withdrawal && (
        <WithdrawalStatusCard
          amount={prize.withdrawal.amount}
          pixKey={prize.withdrawal.pixKey}
          status={prize.withdrawal.status}
          requestedAt={prize.withdrawal.createdAt}
          paidAt={prize.withdrawal.paidAt}
          celebrateKey={`paid:${poolId}`}
        />
      )}
    </section>
  )
}
