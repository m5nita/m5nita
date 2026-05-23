import type { PoolInviteInfo } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { ErrorMessage } from '../../components/ui/ErrorMessage'
import { Loading } from '../../components/ui/Loading'
import { stageLabel } from '../../features/competitions/stageLabels'
import { apiFetch } from '../../lib/api'
import { authClient } from '../../lib/auth'
import { savePendingRedirect } from '../../lib/authGuard'
import { formatCurrency } from '../../lib/utils'

function InvitePage() {
  const { inviteCode } = Route.useParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const {
    data: inviteResult,
    isPending,
    error: fetchError,
  } = useQuery({
    queryKey: ['invite', inviteCode],
    queryFn: async () => {
      const res = await apiFetch(`/api/pools/invite/${inviteCode}`)
      if (res.status === 404) throw new Error('Convite inválido')
      if (res.status === 409) {
        const data = (await res.json()) as { error: string; message: string; poolId?: string }
        if (data.error === 'ALREADY_MEMBER' && data.poolId) {
          return { alreadyMember: true as const, poolId: data.poolId }
        }
        throw new Error(data.message)
      }
      if (!res.ok) throw new Error('Erro ao carregar convite')
      const info = (await res.json()) as PoolInviteInfo
      return { alreadyMember: false as const, info }
    },
  })

  useEffect(() => {
    if (inviteResult?.alreadyMember) {
      navigate({ to: '/pools/$poolId', params: { poolId: inviteResult.poolId }, replace: true })
    }
  }, [inviteResult, navigate])

  if (isPending) return <Loading message="Carregando convite..." />

  if (fetchError) {
    return (
      <ErrorMessage
        title="Convite indisponível"
        message={fetchError.message}
        onRetry={() => navigate({ to: '/' })}
      />
    )
  }

  if (!inviteResult || inviteResult.alreadyMember) return <Loading message="Carregando bolão..." />

  const poolInfo = inviteResult.info

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
    <div className="flex flex-col gap-8 lg:items-center">
      <div className="lg:w-full lg:max-w-[520px] lg:border lg:border-border lg:p-10 flex flex-col gap-8">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Convite
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
            {poolInfo.name}
          </h1>
          <div className="mt-3 h-1 w-12 bg-red" />
          {poolInfo.competitionName && (
            <p className="mt-3 font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
              {poolInfo.competitionName}
              {poolInfo.matchdayFrom != null &&
                (poolInfo.matchdayTo && poolInfo.matchdayTo !== poolInfo.matchdayFrom
                  ? ` · Rodadas ${poolInfo.matchdayFrom} a ${poolInfo.matchdayTo}`
                  : ` · Rodada ${poolInfo.matchdayFrom}`)}
            </p>
          )}
          {poolInfo.singleMatch && (
            <div className="mt-4 border-2 border-border bg-cream p-3">
              <div className="flex items-center gap-2">
                <span className="bg-black px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-widest text-cream">
                  Jogo único
                </span>
                <span className="text-xs text-gray-muted">
                  {poolInfo.singleMatch.matchday != null
                    ? `Rodada ${poolInfo.singleMatch.matchday}`
                    : stageLabel(poolInfo.singleMatch.stage)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-black">
                {poolInfo.singleMatch.homeTeam} × {poolInfo.singleMatch.awayTeam}
              </p>
              <p className="mt-1 text-xs text-gray-muted">
                {new Date(poolInfo.singleMatch.kickoffAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col border-t-2 border-black">
          {[
            { label: 'Criado por', value: poolInfo.owner.name || 'Anonimo' },
            { label: 'Participantes', value: String(poolInfo.memberCount) },
            { label: 'Entrada', value: formatCurrency(poolInfo.entryFee) },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between border-b border-border py-3 text-sm">
              <span className="text-gray-dark">{label}</span>
              <span className="font-medium text-black">{value}</span>
            </div>
          ))}
          {poolInfo.discountPercent > 0 ? (
            <>
              <div className="flex justify-between border-b border-border py-3 text-sm">
                <span className="text-gray-muted line-through">Taxa (5%)</span>
                <span className="text-gray-muted line-through">
                  {formatCurrency(poolInfo.originalPlatformFee)}
                </span>
              </div>
              <div className="flex justify-between border-b border-border py-3 text-sm">
                <span className="text-green font-medium">
                  Taxa com desconto ({(5 * (1 - poolInfo.discountPercent / 100)).toFixed(1)}%)
                </span>
                <span className="text-green font-medium">
                  {formatCurrency(poolInfo.platformFee)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex justify-between border-b border-border py-3 text-sm">
              <span className="text-gray-dark">Taxa (5%)</span>
              <span className="font-medium text-black">{formatCurrency(poolInfo.platformFee)}</span>
            </div>
          )}
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
    </div>
  )
}

export const Route = createFileRoute('/invite/$inviteCode')({
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession()
    if (!session.data) {
      savePendingRedirect(location.pathname)
      throw redirect({ to: '/login' })
    }
    if (!session.data.user) {
      await authClient.signOut().catch(() => {})
      savePendingRedirect(location.pathname)
      throw redirect({ to: '/login' })
    }
    if (!session.data.user.name) {
      throw redirect({ to: '/complete-profile' })
    }
  },
  component: InvitePage,
})
