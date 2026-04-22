import type { PoolDetail } from '@m5nita/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { formatCurrency } from '../../lib/utils'
import { ErrorMessage } from '../ui/ErrorMessage'
import { Loading } from '../ui/Loading'
import { Modal } from '../ui/Modal'
import { InviteTicket } from './InviteTicket'

interface PoolHubProps {
  poolId: string
  activeTab: 'predictions' | 'ranking'
  children: ReactNode
}

export function PoolHub({ poolId, activeTab, children }: PoolHubProps) {
  const { data: session } = useSession()
  const [inviteOpen, setInviteOpen] = useState(false)

  const {
    data: pool,
    isPending,
    error,
  } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async (): Promise<PoolDetail> => {
      const res = await apiFetch(`/api/pools/${poolId}`)
      if (!res.ok) throw new Error('Bolão não encontrado')
      return res.json()
    },
    refetchInterval: (query) => (query.state.data?.hasLiveMatch ? 30_000 : false),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={(error as Error).message} />
  if (!pool) return null

  const isOwner = session?.user?.id === pool.ownerId
  const canInvite = pool.status !== 'closed' && !!pool.inviteCode

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Bolão
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black lg:text-5xl">
            {pool.name}
          </h1>
          <div className="mt-3 h-1 w-12 bg-red" />
          <p className="mt-3 text-sm text-gray-dark">Criado por {pool.owner?.name || 'Anônimo'}</p>
          {pool.competitionName && (
            <p className="mt-1 font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
              {pool.competitionName}
              {pool.matchdayFrom != null &&
                (pool.matchdayTo && pool.matchdayTo !== pool.matchdayFrom
                  ? ` · Rodadas ${pool.matchdayFrom} a ${pool.matchdayTo}`
                  : ` · Rodada ${pool.matchdayFrom}`)}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {canInvite && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="flex h-10 w-10 items-center justify-center border-2 border-border text-black hover:border-black transition-colors cursor-pointer"
              aria-label="Convidar amigos"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </button>
          )}
          {isOwner && (
            <Link
              to="/pools/$poolId/manage"
              params={{ poolId }}
              className="flex h-10 w-10 items-center justify-center border-2 border-border text-black hover:border-black transition-colors cursor-pointer"
              aria-label="Gerenciar bolão"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <div className="bg-cream py-4 text-center lg:py-6">
          <p className="font-display text-2xl font-black text-black lg:text-4xl">
            {pool.memberCount}
          </p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
            Jogadores
          </p>
        </div>
        <div className="bg-cream py-4 text-center lg:py-6">
          <p className="font-display text-2xl font-black text-black lg:text-4xl">
            {formatCurrency(pool.entryFee)}
          </p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
            Entrada
          </p>
        </div>
        <div className="bg-cream py-4 text-center lg:py-6">
          <p className="font-display text-2xl font-black text-green lg:text-4xl">
            {formatCurrency(pool.prizeTotal)}
          </p>
          <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
            Prêmio
          </p>
        </div>
      </div>

      <div className="flex gap-2 lg:max-w-[320px]" role="tablist">
        <Link
          to="/pools/$poolId/predictions"
          params={{ poolId }}
          role="tab"
          aria-selected={activeTab === 'predictions'}
          className={`flex-1 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeTab === 'predictions'
              ? 'bg-black text-white'
              : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
          }`}
        >
          Palpites
        </Link>
        <Link
          to="/pools/$poolId/ranking"
          params={{ poolId }}
          role="tab"
          aria-selected={activeTab === 'ranking'}
          className={`flex-1 py-2.5 text-center font-display text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
            activeTab === 'ranking'
              ? 'bg-black text-white'
              : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
          }`}
        >
          Ranking
        </Link>
      </div>

      {children}

      {canInvite && pool.inviteCode && (
        <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} ariaLabel="Convidar amigos">
          <div className="p-6">
            <InviteTicket poolName={pool.name} inviteCode={pool.inviteCode} />
          </div>
        </Modal>
      )}
    </div>
  )
}
