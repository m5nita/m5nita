import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { useSession } from '../../lib/auth'
import { savePendingRedirect } from '../../lib/authGuard'
import { stripePromise } from '../../lib/stripe'
import { formatCurrency } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Loading } from '../../components/ui/Loading'
import { ErrorMessage } from '../../components/ui/ErrorMessage'
import { PaymentForm } from '../../components/pool/PaymentForm'
import type { PoolInviteInfo } from '@manita/shared'

function InvitePage() {
  const { inviteCode } = Route.useParams()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()
  const [step, setStep] = useState<'info' | 'payment' | 'success'>('info')
  const [clientSecret, setClientSecret] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const {
    data: poolInfo,
    isPending,
    error: fetchError,
  } = useQuery({
    queryKey: ['invite', inviteCode],
    queryFn: async () => {
      const res = await fetch(`/api/pools/invite/${inviteCode}`, { credentials: 'include' })
      if (res.status === 404) throw new Error('Convite invalido')
      if (res.status === 409) {
        const data = await res.json()
        throw new Error(data.message)
      }
      if (!res.ok) throw new Error('Erro ao carregar convite')
      return res.json() as Promise<PoolInviteInfo>
    },
    enabled: !!session,
  })

  if (!sessionPending && !session) {
    savePendingRedirect(window.location.pathname)
    navigate({ to: '/login' })
    return null
  }

  if (sessionPending || isPending) return <Loading message="Carregando convite..." />

  if (fetchError) {
    return <ErrorMessage title="Convite indisponivel" message={fetchError.message} onRetry={() => navigate({ to: '/' })} />
  }

  if (!poolInfo) return null

  if (step === 'success') {
    return (
      <div className="flex min-h-[60vh] flex-col justify-center">
        <div className="mb-8">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-green">Sucesso</p>
          <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">Voce Entrou</h1>
          <div className="mt-3 h-1 w-12 bg-green" />
          <p className="mt-4 text-sm text-gray-dark">
            Agora voce faz parte do bolao <strong className="text-black">{poolInfo.name}</strong>
          </p>
        </div>
        <Button onClick={() => navigate({ to: '/' })} size="lg" className="w-full">
          Ir para Home
        </Button>
      </div>
    )
  }

  if (step === 'payment' && clientSecret?.startsWith('mock_')) {
    setStep('success')
    return null
  }

  if (step === 'payment' && clientSecret && stripePromise) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Pagamento</p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Pagar</h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm amount={poolInfo.entryFee} onSuccess={() => setStep('success')} onError={(msg) => setError(msg)} />
        </Elements>
        {error && <p className="text-xs font-medium text-red" role="alert">{error}</p>}
      </div>
    )
  }

  async function handleJoin() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/pools/${poolInfo!.id}/join`, { method: 'POST', credentials: 'include' })
      if (!res.ok) { const data = await res.json(); setError(data.message || 'Erro'); return }
      const data = await res.json()
      setClientSecret(data.payment.clientSecret)
      setStep('payment')
    } catch {
      setError('Erro de conexao.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Convite</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">{poolInfo.name}</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <div className="flex flex-col border-t-2 border-black">
        {[
          { label: 'Criado por', value: poolInfo.owner.name || 'Anonimo' },
          { label: 'Participantes', value: String(poolInfo.memberCount) },
          { label: 'Entrada', value: formatCurrency(poolInfo.entryFee) },
          { label: 'Taxa (5%)', value: formatCurrency(poolInfo.platformFee) },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between border-b border-border py-3 text-sm">
            <span className="text-gray-dark">{label}</span>
            <span className="font-medium text-black">{value}</span>
          </div>
        ))}
        <div className="flex justify-between py-4">
          <span className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Premio Estimado</span>
          <span className="font-display text-2xl font-black text-green">{formatCurrency(poolInfo.prizeTotal)}</span>
        </div>
      </div>

      {error && <p className="text-xs font-medium text-red" role="alert">{error}</p>}

      <Button onClick={handleJoin} loading={loading} className="w-full" size="lg">
        Pagar e Entrar — {formatCurrency(poolInfo.entryFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/invite/$inviteCode')({
  component: InvitePage,
})
