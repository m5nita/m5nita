import type { PoolInviteInfo } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorMessage } from '../../components/ui/ErrorMessage'
import { Loading } from '../../components/ui/Loading'
import { apiFetch } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { savePendingRedirect } from '../../lib/authGuard'
import { formatCurrency } from '../../lib/utils'

function InvitePage() {
  const { inviteCode } = Route.useParams()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = useSession()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const {
    data: poolInfo,
    isPending,
    error: fetchError,
  } = useQuery({
    queryKey: ['invite', inviteCode],
    queryFn: async () => {
      const res = await apiFetch(`/api/pools/invite/${inviteCode}`)
      if (res.status === 404) throw new Error('Convite inválido')
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
    return (
      <ErrorMessage
        title="Convite indisponível"
        message={fetchError.message}
        onRetry={() => navigate({ to: '/' })}
      />
    )
  }

  if (!poolInfo) return null

  async function handleJoin() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/pools/${poolInfo?.id}/join`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Erro')
        return
      }
      const data = await res.json()

      if (data.payment.checkoutUrl) {
        window.location.href = data.payment.checkoutUrl
      } else {
        navigate({ to: '/' })
      }
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Convite
        </p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          {poolInfo.name}
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <div className="flex flex-col border-t-2 border-black">
        {[
          { label: 'Criado por', value: poolInfo.owner.name || 'Anônimo' },
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
          <span className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Prêmio Estimado
          </span>
          <span className="font-display text-2xl font-black text-green">
            {formatCurrency(poolInfo.prizeTotal)}
          </span>
        </div>
      </div>

      {error && (
        <p className="text-xs font-medium text-red" role="alert">
          {error}
        </p>
      )}

      <Button onClick={handleJoin} loading={loading} className="w-full" size="lg">
        Pagar e Entrar — {formatCurrency(poolInfo.entryFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/invite/$inviteCode')({
  component: InvitePage,
})
