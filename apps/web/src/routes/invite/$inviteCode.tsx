import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { useSession } from '../../lib/auth'
import { savePendingRedirect } from '../../lib/authGuard'
import { stripePromise } from '../../lib/stripe'
import { formatCurrency } from '../../lib/utils'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
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

  // Redirect to login if not authenticated
  if (!sessionPending && !session) {
    savePendingRedirect(window.location.pathname)
    navigate({ to: '/login' })
    return null
  }

  if (sessionPending || isPending) return <Loading message="Carregando convite..." />

  if (fetchError) {
    return (
      <ErrorMessage
        title="Convite indisponivel"
        message={fetchError.message}
        onRetry={() => navigate({ to: '/' })}
      />
    )
  }

  if (!poolInfo) return null

  if (step === 'success') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold text-navy">Voce entrou!</h1>
          <p className="mt-1 text-gray-dark">
            Agora voce faz parte do bolao <strong>{poolInfo.name}</strong>
          </p>
        </div>
        <Button onClick={() => navigate({ to: '/' })} size="lg">
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
        <h1 className="font-heading text-2xl font-bold text-navy">Pagamento</h1>
        <p className="text-sm text-gray-dark">
          Entrada no bolao <strong>{poolInfo.name}</strong>
        </p>
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
          <PaymentForm
            amount={poolInfo.entryFee}
            onSuccess={() => setStep('success')}
            onError={(msg) => setError(msg)}
          />
        </Elements>
        {error && (
          <p className="text-sm text-red" role="alert">{error}</p>
        )}
      </div>
    )
  }

  async function handleJoin() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/pools/${poolInfo!.id}/join`, {
        method: 'POST',
        credentials: 'include',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Erro ao entrar no bolao')
        return
      }

      const data = await res.json()
      setClientSecret(data.payment.clientSecret)
      setStep('payment')
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-sm text-gray-dark">Voce foi convidado para</p>
        <h1 className="font-heading text-2xl font-bold text-navy">{poolInfo.name}</h1>
      </div>

      <Card padding="lg">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-dark">Criado por</span>
            <span className="font-medium text-navy">{poolInfo.owner.name || 'Anonimo'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-dark">Participantes</span>
            <span className="font-medium text-navy">{poolInfo.memberCount}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-dark">Entrada</span>
            <span className="font-medium text-navy">{formatCurrency(poolInfo.entryFee)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-dark">Taxa (5%)</span>
            <span className="text-gray-dark">{formatCurrency(poolInfo.platformFee)}</span>
          </div>
          <div className="border-t border-navy/10 pt-2 flex justify-between">
            <span className="font-medium text-navy">Premio estimado</span>
            <span className="font-heading text-xl font-bold text-green">
              {formatCurrency(poolInfo.prizeTotal)}
            </span>
          </div>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-red" role="alert">{error}</p>
      )}

      <Button onClick={handleJoin} loading={loading} className="w-full" size="lg">
        Pagar e entrar — {formatCurrency(poolInfo.entryFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/invite/$inviteCode')({
  component: InvitePage,
})
