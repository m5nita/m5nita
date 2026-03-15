import { Link } from '@tanstack/react-router'
import { Card } from '../ui/Card'
import type { PoolListItem } from '@manita/shared'

interface PoolCardProps {
  pool: PoolListItem
}

export function PoolCard({ pool }: PoolCardProps) {
  const formattedFee = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(pool.entryFee / 100)

  return (
    <Link to="/pools/$poolId" params={{ poolId: pool.id }}>
      <Card className="transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-bold text-navy">{pool.name}</h3>
            <p className="text-sm text-gray-dark">
              {pool.memberCount} participante{pool.memberCount !== 1 ? 's' : ''} · {formattedFee}
            </p>
          </div>
          <div className="text-right">
            {pool.userPosition != null ? (
              <div>
                <p className="font-heading text-2xl font-bold text-navy">
                  {pool.userPosition}°
                </p>
                <p className="text-xs text-gray">{pool.userPoints} pts</p>
              </div>
            ) : (
              <p className="text-sm text-gray">—</p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
