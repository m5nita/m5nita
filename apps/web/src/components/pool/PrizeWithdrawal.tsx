import type { PrizeInfo } from '@m5nita/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { useCelebrateOnce } from '../../lib/celebrate'
import { formatCurrency } from '../../lib/utils'
import { Confetti } from '../ui/Confetti'
import { Loading } from '../ui/Loading'
import { PrizeWithdrawalForm } from './PrizeWithdrawalForm'

interface PrizeWithdrawalProps {
  poolId: string
}

const SUPPORT_URL = 'https://t.me/m5nita_bot?start=suporte'

// Don't echo the full PIX key back on screen — keep just enough to recognize it.
function maskPixKey(key: string): string {
  if (key.length <= 4) return '•'.repeat(key.length)
  return `${key.slice(0, 2)}${'•'.repeat(Math.max(3, key.length - 4))}${key.slice(-2)}`
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
              Você ganhou 🏆
            </p>
            <p className="mt-1 font-display text-5xl font-black leading-none text-green">
              {formatCurrency(prize.winnerShare)}
            </p>
            <p className="mt-2 text-sm text-gray-dark">
              {prize.withdrawal
                ? 'Parabéns! O prêmio é seu — acompanhe a retirada abaixo.'
                : 'Parabéns! Informe sua chave PIX abaixo para receber o prêmio.'}
            </p>
          </div>
        </>
      )}
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
        <div className="border-l-4 border-green bg-green/5 p-4">
          <p className="text-sm font-medium text-gray-dark mb-2">Retirada solicitada</p>
          <div className="flex flex-col gap-1 text-xs text-gray-muted">
            <p>
              Valor:{' '}
              <span className="text-black font-medium">
                {formatCurrency(prize.withdrawal.amount)}
              </span>
            </p>
            <p>
              Chave PIX:{' '}
              <span className="text-black font-medium">{maskPixKey(prize.withdrawal.pixKey)}</span>
            </p>
            <p>
              Status:{' '}
              <span className="text-black font-medium">
                {prize.withdrawal.status === 'pending' && 'Pendente'}
                {prize.withdrawal.status === 'processing' && 'Processando'}
                {prize.withdrawal.status === 'completed' && 'Concluído'}
                {prize.withdrawal.status === 'failed' && 'Falhou'}
              </span>
            </p>
          </div>
          {prize.withdrawal.status === 'failed' && (
            <p className="mt-3 text-xs text-red">
              A retirada não foi concluída.{' '}
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Fale com o suporte
              </a>{' '}
              para reenviar.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
