import type { ReactNode } from 'react'
import { ErrorMessage } from '../ui/ErrorMessage'
import { PoolCardSkeleton } from '../ui/Skeleton'

interface PoolsSectionProps {
  isPending: boolean
  isError: boolean
  isEmpty: boolean
  onRetry: () => void
  children?: ReactNode
}

/**
 * Renders the "Meus Bolões" body. Crucially distinguishes a failed fetch (show
 * an error with retry) from a successful-but-empty result (show the empty
 * state) — previously a failed /api/pools rendered "Nenhum bolão" as if the
 * member had no pools, which bites hardest under live-match load.
 */
export function PoolsSection({
  isPending,
  isError,
  isEmpty,
  onRetry,
  children,
}: PoolsSectionProps) {
  if (isPending) {
    return (
      <div
        data-testid="pools-loading"
        className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-5"
      >
        <PoolCardSkeleton />
        <PoolCardSkeleton />
        <PoolCardSkeleton />
      </div>
    )
  }

  if (isError) {
    return <ErrorMessage message="Não foi possível carregar seus bolões." onRetry={onRetry} />
  }

  if (isEmpty) {
    return (
      <div className="border-2 border-dashed border-border py-10 text-center">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-gray-muted">
          Nenhum bolão
        </p>
        <p className="mt-1 text-xs text-gray-muted">Crie um ou entre pelo convite de um amigo</p>
      </div>
    )
  }

  return <>{children}</>
}
