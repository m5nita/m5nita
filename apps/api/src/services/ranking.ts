import { and, eq, gt, inArray, or, sql } from 'drizzle-orm'
import { provisionalKnockoutContext } from '../application/prediction/provisionalKnockout'
import { getContainer } from '../container'
import { db } from '../db/client'
import { match as matchTable } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'
import { Ranking } from '../domain/ranking/Ranking'
import type { ScoringPolicy } from '../domain/scoring/ScoringPolicy'
import { rankingAggregateCache } from './rankingCache'

export async function getPoolRanking(poolId: string, currentUserId: string) {
  const { poolRepo, rankingRepo } = getContainer()
  const pool = await poolRepo.findById(poolId)

  // Read the precomputed standings (cheap; ~one row per member). The cache stays
  // as a thin layer that collapses concurrent reads/focus bursts; it is busted
  // when standings change at match-finish (jobs/calcPoints.ts).
  const rawEntries = await rankingAggregateCache.getOrCompute(poolId, () =>
    rankingRepo.getStandings(poolId),
  )

  const livePoints = pool ? await computeLivePointsByUser(poolId, pool.scoringPolicy()) : new Map()

  const entries = rawEntries.map((r) => ({
    userId: r.userId,
    name: r.name,
    totalPoints: r.totalPoints,
    livePoints: livePoints.get(r.userId) ?? 0,
    exactMatches: r.exactMatches,
  }))

  return Ranking.build(entries, currentUserId)
}

/** How long after a match flips to `finished` we keep treating its unscored
 * predictions as provisional (covers the in-tick window before calcPoints runs,
 * even when several matches finish at once and are scored sequentially). */
const JUST_FINISHED_WINDOW_MS = 30 * 60_000

async function computeLivePointsByUser(
  poolId: string,
  scoringPolicy: ScoringPolicy,
): Promise<Map<string, number>> {
  // Candidate matches: live, OR finished within the last JUST_FINISHED_WINDOW_MS
  // (scoring may not have run yet). Both resolve via match_status_idx and the
  // recently-finished set is tiny, so this stays cheap.
  const since = new Date(Date.now() - JUST_FINISHED_WINDOW_MS)
  const liveMatches = await db
    .select({
      id: matchTable.id,
      home: matchTable.homeScore,
      away: matchTable.awayScore,
      status: matchTable.status,
      stage: matchTable.stage,
      duration: matchTable.duration,
      winner: matchTable.winner,
      extraHome: matchTable.extraTimeHomeScore,
      extraAway: matchTable.extraTimeAwayScore,
    })
    .from(matchTable)
    .where(
      and(
        sql`${matchTable.homeScore} is not null and ${matchTable.awayScore} is not null`,
        or(
          eq(matchTable.status, 'live'),
          and(eq(matchTable.status, 'finished'), gt(matchTable.updatedAt, since)),
        ),
      ),
    )

  if (liveMatches.length === 0) return new Map()

  const scoreByMatch = new Map(liveMatches.map((m) => [m.id, m]))
  // Only UNSCORED predictions are provisional. The moment calcPoints writes
  // `points`, the prediction is finalized into pool_standing instead, so this
  // `points is null` filter is what prevents double counting at the transition.
  const livePreds = await db
    .select({
      userId: prediction.userId,
      predHome: prediction.homeScore,
      predAway: prediction.awayScore,
      matchId: prediction.matchId,
      advancePick: prediction.advancePick,
    })
    .from(prediction)
    .where(
      and(
        eq(prediction.poolId, poolId),
        sql`${prediction.points} is null`,
        inArray(
          prediction.matchId,
          liveMatches.map((m) => m.id),
        ),
      ),
    )

  const byUser = new Map<string, number>()
  for (const row of livePreds) {
    const m = scoreByMatch.get(row.matchId)
    if (!m || m.home === null || m.away === null) continue
    const advancePick =
      row.advancePick === 'home' || row.advancePick === 'away' ? row.advancePick : null
    const knockout = provisionalKnockoutContext(
      {
        status: m.status,
        stage: m.stage,
        duration: m.duration,
        winner: m.winner,
        home: m.home,
        away: m.away,
        extraHome: m.extraHome,
        extraAway: m.extraAway,
      },
      advancePick,
    )
    const pts = scoringPolicy.score(row.predHome, row.predAway, m.home, m.away, knockout).points
    byUser.set(row.userId, (byUser.get(row.userId) ?? 0) + pts)
  }
  return byUser
}

export async function getPoolPrizeTotal(poolId: string) {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(poolMember)
    .where(eq(poolMember.poolId, poolId))

  const memberCount = result?.count ?? 0
  return { memberCount }
}
