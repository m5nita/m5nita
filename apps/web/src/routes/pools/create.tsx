import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { PaymentForm } from '../../components/pool/PaymentForm'
import { InviteTicket } from '../../components/pool/InviteTicket'
import { stripePromise } from '../../lib/stripe'
import { formatCurrency, calculatePlatformFee } from '../../lib/utils'
import { POOL } from '@manita/shared'

type Step = 'config' | 'payment' | 'invite'

function CreatePoolPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('config')
  const [name, setName] = useState('')
  const [entryFee, setEntryFee] = useState(5000)
  const [customFee, setCustomFee] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [createdPool, setCreatedPool] = useState<{ name: string; inviteCode: string } | null>(null)

  const currentFee = customFee ? Number(customFee) * 100 : entryFee
  const platformFee = calculatePlatformFee(currentFee)
  const isValidFee = currentFee >= POOL.MIN_ENTRY_FEE && currentFee <= POOL.MAX_ENTRY_FEE

  async function handleCreate() {
    if (name.trim().length < 3) {
      setError('Nome deve ter pelo menos 3 caracteres')
      return
    }
    if (!isValidFee) {
      setError('Valor deve ser entre R$ 10 e R$ 1.000')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), entryFee: currentFee }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Erro ao criar bolao')
        return
      }

      const data = await res.json()
      setClientSecret(data.payment.clientSecret)
      setCreatedPool({ name: data.pool.name, inviteCode: data.pool.inviteCode })
      setStep('payment')
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'invite' && createdPool) {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="font-heading text-2xl font-bold text-navy">Bolao criado!</h1>
          <p className="mt-1 text-gray-dark">Convide seus amigos para participar</p>
        </div>
        <InviteTicket poolName={createdPool.name} inviteCode={createdPool.inviteCode} />
        <Button variant="secondary" onClick={() => navigate({ to: '/' })} className="w-full">
          Ir para Home
        </Button>
      </div>
    )
  }

  // Mock mode: skip payment step if clientSecret is mock
  if (step === 'payment' && clientSecret?.startsWith('mock_')) {
    setStep('invite')
    return null
  }

  if (step === 'payment' && clientSecret && stripePromise) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl font-bold text-navy">Pagamento</h1>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm
            amount={currentFee}
            onSuccess={() => setStep('invite')}
            onError={(msg) => setError(msg)}
          />
        </Elements>
        {error && (
          <p className="text-sm text-red" role="alert">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold text-navy">Criar bolao</h1>

      <Input
        label="Nome do bolao"
        placeholder="Ex: Bolao da Galera"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
      />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-navy">Valor da entrada</label>
        <div className="grid grid-cols-4 gap-2">
          {POOL.QUICK_SELECT_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setEntryFee(value); setCustomFee('') }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                !customFee && entryFee === value
                  ? 'border-navy bg-navy text-cream'
                  : 'border-navy/20 text-navy hover:bg-navy/5'
              }`}
            >
              {formatCurrency(value)}
            </button>
          ))}
        </div>
        <Input
          label="Ou valor personalizado"
          type="number"
          placeholder="0,00"
          value={customFee}
          onChange={(e) => setCustomFee(e.target.value)}
          min={10}
          max={1000}
        />
      </div>

      <Card className="bg-navy/5">
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-dark">Entrada</span>
            <span className="font-medium text-navy">{formatCurrency(currentFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-dark">Taxa plataforma (5%)</span>
            <span className="text-gray-dark">{formatCurrency(platformFee)}</span>
          </div>
          <div className="mt-1 border-t border-navy/10 pt-1 flex justify-between">
            <span className="font-medium text-navy">Total a pagar</span>
            <span className="font-heading font-bold text-navy">{formatCurrency(currentFee)}</span>
          </div>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-red" role="alert">{error}</p>
      )}

      <Button onClick={handleCreate} loading={loading} disabled={!isValidFee} className="w-full" size="lg">
        Criar e pagar {formatCurrency(currentFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/pools/create')({
  component: CreatePoolPage,
})
