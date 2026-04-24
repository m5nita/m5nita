import type { PixKeyType } from '@m5nita/shared'
import { validatePixKey } from '@m5nita/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { Button } from '../ui/Button'
import { PixKeyInput } from './PixKeyInput'

interface PrizeWithdrawalFormProps {
  poolId: string
  onSuccess?: () => void
}

export function PrizeWithdrawalForm({ poolId, onSuccess }: PrizeWithdrawalFormProps) {
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('cpf')
  const [pixKey, setPixKey] = useState('')

  const mutation = useMutation({
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
      onSuccess?.()
    },
  })

  const canSubmit = pixKey.length > 0 && validatePixKey(pixKeyType, pixKey).success

  return (
    <div className="flex flex-col gap-4">
      <PixKeyInput
        pixKeyType={pixKeyType}
        pixKey={pixKey}
        onTypeChange={setPixKeyType}
        onKeyChange={setPixKey}
      />
      <Button
        onClick={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={!canSubmit}
        className="w-full"
      >
        Solicitar Retirada
      </Button>
      {mutation.error && (
        <p className="text-xs font-medium text-red">{(mutation.error as Error).message}</p>
      )}
    </div>
  )
}
