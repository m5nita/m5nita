import type { PixKeyType, PrizeInfo } from '@m5nita/shared'
import { validatePixKey } from '@m5nita/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Loading } from '../ui/Loading'
import { PixKeyInput } from './PixKeyInput'

interface PrizeWithdrawalProps {
  poolId: string
}

export function PrizeWithdrawal({ poolId }: PrizeWithdrawalProps) {
  const queryClient = useQueryClient()
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf')
  const [pixKey, setPixKey] = useState('')

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

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/pools/${poolId}/prize/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pixKeyType, pixKey }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro ao solicitar retirada')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prize', poolId] })
    },
  })

  if (isPending) return <Loading />
  if (error || !prize) return null

  const canSubmit = pixKey.length > 0 && validatePixKey(pixKeyType, pixKey).success

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          {prize.winnerCount > 1 ? 'Vencedores' : 'Vencedor'}
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
            <p className="font-display text-lg font-black text-green">
              {formatCurrency(prize.winnerShare)}
            </p>
          </div>
        ))}
      </div>

      {/* Withdrawal form or status */}
      {prize.isWinner && !prize.withdrawal && (
        <div className="flex flex-col gap-4 border-l-4 border-green bg-green/5 p-4">
          <p className="text-sm font-medium text-gray-dark">
            Parabéns! Informe sua chave PIX para solicitar a retirada.
          </p>
          <PixKeyInput
            pixKeyType={pixKeyType}
            pixKey={pixKey}
            onTypeChange={setPixKeyType}
            onKeyChange={setPixKey}
          />
          <Button
            onClick={() => withdrawMutation.mutate()}
            loading={withdrawMutation.isPending}
            disabled={!canSubmit}
            className="w-full"
          >
            Solicitar Retirada
          </Button>
          {withdrawMutation.error && (
            <p className="text-xs font-medium text-red">{withdrawMutation.error.message}</p>
          )}
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
              Chave PIX: <span className="text-black font-medium">{prize.withdrawal.pixKey}</span>
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
        </div>
      )}
    </section>
  )
}
