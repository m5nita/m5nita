import type { PoolListItem } from '@m5nita/shared'
import { Link } from '@tanstack/react-router'
import { formatCurrency } from '../../lib/utils'

interface PoolCardProps {
  pool: PoolListItem
  index: number
}

export function PoolCard({ pool, index }: PoolCardProps) {
  return (
    <Link to="/pools/$poolId" params={{ poolId: pool.id }} className="group cursor-pointer">
      <div className="flex items-center gap-4 border-b border-border py-4 transition-colors group-hover:border-black">
        <span className="font-display text-3xl font-black text-gray-light group-hover:text-red transition-colors">
          {String(index).padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-bold uppercase tracking-wide text-black truncate">
            {pool.name}
          </h3>
          <p className="text-xs text-gray-muted">
            {pool.competitionName && <>{pool.competitionName} · </>}
            {pool.memberCount} participante{pool.memberCount !== 1 ? 's' : ''} ·{' '}
            {formatCurrency(pool.entryFee)}
          </p>
        </div>
        {pool.userPosition != null ? (
          <div className="text-right">
            <p className="font-display text-2xl font-black text-black">{pool.userPosition}°</p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-muted">
              {pool.userPoints} pts
            </p>
          </div>
        ) : (
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gray-light group-hover:text-black transition-colors"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        )}
      </div>
    </Link>
  )
}
