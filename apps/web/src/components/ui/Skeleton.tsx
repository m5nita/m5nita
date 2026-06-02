interface SkeletonProps {
  className?: string
}

function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-black/10 ${className}`} aria-hidden="true" />
}

export function PoolCardSkeleton() {
  return (
    <div className="border-2 border-border bg-cream p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Skeleton className="h-5 w-32 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-10" />
      </div>
    </div>
  )
}

export function MatchCardSkeleton() {
  return (
    <div className="flex items-center gap-3 border-2 border-border bg-cream p-3">
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
    <div className="flex items-center gap-4 border-b border-border px-3 py-4">
      <Skeleton className="h-9 w-10" />
      <div className="flex-1">
        <Skeleton className="h-4 w-32 mb-1.5" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-7 w-12" />
    </div>
  )
}

export { Skeleton }
