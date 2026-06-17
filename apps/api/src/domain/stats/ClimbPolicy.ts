import type { PoolStatsAggregateRow } from './StatsRepository.port'

/** One of the viewer's not-yet-started matches (their own prediction state only). */
export type PendingMatchInput = {
  matchId: string
  homeTeam: string
  awayTeam: string
  matchDate: Date
  hasPrediction: boolean
}

export type ClimbNextMatch = {
  matchId: string
  homeTeam: string
  awayTeam: string
  kickoff: string
  hasPrediction: boolean
  action: 'submit' | 'change'
}

export type ClimbBlock = {
  position: number | null
  memberCount: number
  leads: boolean
  /** Gap to the rank immediately above, in points and whole exact-scores. Null when leading/unranked. */
  nextUp: { gap: number; exactsToClose: number } | null
  /** The member one rank below and how close they are. Null when last/unranked. */
  chaser: { name: string | null; gap: number; close: boolean } | null
  /** The soonest match the viewer can still act on. Null when none pending. */
  nextMatch: ClimbNextMatch | null
  state: 'ok' | 'insufficient_data'
}

export type ClimbInput = {
  aggregate: PoolStatsAggregateRow[]
  viewerUserId: string
  maxPoints: number
  pendingMatches: PendingMatchInput[]
}

/**
 * The viewer's path up the table: how far to the rank above (points + exact
 * scores), who is chasing them, and the next match they can still act on. Reads
 * only the public standings (same order as the ranking engine: points desc,
 * exact desc) — never any third party's prediction.
 */
export const ClimbPolicy = {
  build(input: ClimbInput): ClimbBlock {
    const { aggregate, viewerUserId, maxPoints, pendingMatches } = input
    const nextMatch = pickNextMatch(pendingMatches)
    const memberCount = aggregate.length
    const viewer = aggregate.find((r) => r.userId === viewerUserId)

    // No personal standing yet → there is no race to read; still surface the
    // next match so a brand-new player can act.
    if (!viewer || viewer.finishedCount === 0) {
      return {
        position: null,
        memberCount,
        leads: false,
        nextUp: null,
        chaser: null,
        nextMatch,
        state: 'insufficient_data',
      }
    }

    const sorted = [...aggregate].sort(byStanding)
    const idx = sorted.findIndex((r) => r.userId === viewerUserId)
    const above = sorted[idx - 1]
    const below = sorted[idx + 1]

    const nextUp = above
      ? (() => {
          const gap = Math.max(0, above.pointsTotal - viewer.pointsTotal)
          return { gap, exactsToClose: Math.ceil(gap / maxPoints) }
        })()
      : null

    const chaser = below
      ? (() => {
          const gap = Math.max(0, viewer.pointsTotal - below.pointsTotal)
          return { name: below.displayName, gap, close: gap <= maxPoints }
        })()
      : null

    return {
      position: idx + 1,
      memberCount,
      leads: idx === 0,
      nextUp,
      chaser,
      nextMatch,
      state: 'ok',
    }
  },
}

// Same tiebreaker as the ranking engine (points desc, exact desc); userId keeps
// the order stable so neighbours are deterministic.
function byStanding(a: PoolStatsAggregateRow, b: PoolStatsAggregateRow): number {
  return (
    b.pointsTotal - a.pointsTotal ||
    b.exactCount - a.exactCount ||
    (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)
  )
}

function pickNextMatch(pending: PendingMatchInput[]): ClimbNextMatch | null {
  if (pending.length === 0) return null
  const soonest = [...pending].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime())[0]
  return {
    matchId: soonest.matchId,
    homeTeam: soonest.homeTeam,
    awayTeam: soonest.awayTeam,
    kickoff: soonest.matchDate.toISOString(),
    hasPrediction: soonest.hasPrediction,
    action: soonest.hasPrediction ? 'change' : 'submit',
  }
}
