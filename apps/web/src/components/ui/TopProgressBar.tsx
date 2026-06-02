import { useIsFetching } from '@tanstack/react-query'

/**
 * Thin animated bar at the top of the screen while a navigation / first-time
 * fetch is in flight — so tapping something that triggers a load gives an
 * immediate "working…" signal instead of a few dead seconds.
 *
 * The predicate counts only queries with no data yet (initial loads /
 * navigations to uncached screens); background refetches (the 30s live polls,
 * which already have data) are excluded so the bar doesn't flash constantly.
 */
export function TopProgressBar() {
  const loading = useIsFetching({ predicate: (q) => q.state.data === undefined })
  if (loading === 0) return null
  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-red/15"
      role="progressbar"
      aria-label="Carregando"
    >
      <div className="h-full w-1/3 bg-red animate-[progressSlide_1s_ease-in-out_infinite]" />
    </div>
  )
}
