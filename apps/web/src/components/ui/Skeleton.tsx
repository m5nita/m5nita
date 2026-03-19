interface SkeletonProps {
  className?: string
}

function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-lg bg-navy/10 ${className}`} aria-hidden="true" />
}

export function PoolCardSkeleton() {
  return (
    <div className="rounded-xl border border-navy/5 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </div>
  )
}

export function MatchCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-navy/10 bg-white p-3">
      <div className="flex flex-1 flex-col items-center gap-1">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-6 w-12" />
      <div className="flex flex-1 flex-col items-center gap-1">
        <Skeleton className="h-6 w-6 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

export function RankingRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-navy/10 bg-white p-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-4 w-24 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-6 w-12" />
    </div>
  )
}

export { Skeleton }
