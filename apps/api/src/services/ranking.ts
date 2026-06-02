import { and, eq, inArray, sql } from 'drizzle-orm'
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

async function computeLivePointsByUser(
  poolId: string,
  scoringPolicy: ScoringPolicy,
): Promise<Map<string, number>> {
  // Resolve the (few) live matches first via match_status_idx, then read only
  // this pool's predictions for them through prediction_pool_id_match_id_idx —
  // instead of seq-scanning all ~63k pool predictions to find the handful live.
  const liveMatches = await db
    .select({
      id: matchTable.id,
      home: matchTable.homeScore,
      away: matchTable.awayScore,
    })
    .from(matchTable)
    .where(eq(matchTable.status, 'live'))

  if (liveMatches.length === 0) return new Map()

  const scoreByMatch = new Map(liveMatches.map((m) => [m.id, m]))
  const livePreds = await db
    .select({
      userId: prediction.userId,
      predHome: prediction.homeScore,
      predAway: prediction.awayScore,
      matchId: prediction.matchId,
    })
    .from(prediction)
    .where(
      and(
        eq(prediction.poolId, poolId),
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
    const pts = scoringPolicy.score(row.predHome, row.predAway, m.home, m.away).points
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
