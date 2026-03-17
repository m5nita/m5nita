import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
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
    if (name.trim().length < 3) { setError('Nome deve ter pelo menos 3 caracteres'); return }
    if (!isValidFee) { setError('Valor deve ser entre R$ 10 e R$ 1.000'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/pools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ name: name.trim(), entryFee: currentFee }),
      })
      if (!res.ok) { const data = await res.json(); setError(data.message || 'Erro ao criar bolão'); return }
      const data = await res.json()
      setClientSecret(data.payment.clientSecret)
      setCreatedPool({ name: data.pool.name, inviteCode: data.pool.inviteCode })
      setStep('payment')
    } catch { setError('Erro de conexão.') } finally { setLoading(false) }
  }

  if (step === 'invite' && createdPool) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Sucesso</p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Bolão Criado</h1>
          <div className="mt-3 h-1 w-12 bg-green" />
        </div>
        <InviteTicket poolName={createdPool.name} inviteCode={createdPool.inviteCode} />
        <Button variant="secondary" onClick={() => navigate({ to: '/' })} className="w-full">Ir para Home</Button>
      </div>
    )
  }

  if (step === 'payment' && clientSecret?.startsWith('mock_')) { setStep('invite'); return null }

  if (step === 'payment' && clientSecret && stripePromise) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Pagamento</p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Pagar</h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm amount={currentFee} onSuccess={() => setStep('invite')} onError={(msg) => setError(msg)} />
        </Elements>
        {error && <p className="text-xs font-medium text-red" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Novo</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Criar Bolão</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <Input label="Nome do bolão" placeholder="Ex: Bolão da Galera" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />

      <div className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">Valor da Entrada</p>
        <div className="grid grid-cols-4 gap-2">
          {POOL.QUICK_SELECT_VALUES.map((value) => (
            <button key={value} type="button" onClick={() => { setEntryFee(value); setCustomFee('') }}
              className={`font-display text-xs font-bold uppercase tracking-wider py-2.5 transition-colors cursor-pointer ${
                !customFee && entryFee === value ? 'bg-black text-white' : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
              }`}>
              {formatCurrency(value)}
            </button>
          ))}
        </div>
        <Input label="Ou valor personalizado (R$)" type="number" placeholder="0" value={customFee} onChange={(e) => setCustomFee(e.target.value)} min={10} max={1000} />
      </div>

      <div className="border-t-2 border-black pt-4 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-dark">Entrada</span>
          <span className="font-medium text-black">{formatCurrency(currentFee)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-muted">Taxa (5%)</span>
          <span className="text-gray-muted">{formatCurrency(platformFee)}</span>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-red" role="alert">{error}</p>}

      <Button onClick={handleCreate} loading={loading} disabled={!isValidFee} className="w-full" size="lg">
        Criar e Pagar {formatCurrency(currentFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/pools/create')({ component: CreatePoolPage })
