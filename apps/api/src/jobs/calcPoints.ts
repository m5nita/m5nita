import { getContainer } from '../container'
import { knockoutContextFor } from '../domain/match/KnockoutResult'
import { RangeScoringPolicy, type ScoringPolicy } from '../domain/scoring/ScoringPolicy'
import { invalidateRankingAggregate } from '../services/rankingCache'
import { invalidateParticipantStatsAggregate } from '../services/statsCache'

export async function calcPointsForMatch(matchId: string) {
  const { matchRepo, predictionRepo, poolRepo, unitOfWork, statsRepo, statsUnlockRepo } =
    getContainer()

  const matchData = await matchRepo.findById(matchId)

  if (matchData?.status !== 'finished') {
    console.log(`[CalcPoints] Match ${matchId} not finished, skipping`)
    return
  }

  if (matchData.homeScore == null || matchData.awayScore == null) {
    console.log(`[CalcPoints] Match ${matchId} missing scores, skipping`)
    return
  }

  const predictions = await predictionRepo.findByMatch(matchId)

  const policyCache = new Map<string, ScoringPolicy>()
  async function policyFor(poolId: string): Promise<ScoringPolicy> {
    const cached = policyCache.get(poolId)
    if (cached) return cached
    const pool = await poolRepo.findById(poolId)
    const policy = pool?.scoringPolicy() ?? RangeScoringPolicy
    policyCache.set(poolId, policy)
    return policy
  }

  const pointUpdates: Array<{ id: string; points: number }> = []
  for (const pred of predictions) {
    const policy = await policyFor(pred.poolId)
    const knockout = knockoutContextFor(matchData, pred.advancePick)
    const points = policy.score(
      pred.homeScore,
      pred.awayScore,
      matchData.homeScore,
      matchData.awayScore,
      knockout,
    ).points

    if (pred.id) {
      pointUpdates.push({ id: pred.id, points })
    }
  }

  const affectedPools = [...new Set(predictions.map((p) => p.poolId))]

  // Atomic: write every prediction's points AND recompute the affected pools'
  // standings in one transaction, so a concurrent ranking read sees either the
  // pre-finish state (points still null → counted as provisional) or the
  // post-finish state (points set → counted in standings), never the gap where
  // a just-finished match's points belong to neither bucket.
  await unitOfWork.run(async (repos) => {
    await repos.predictions.updatePointsBatch(pointUpdates)
    for (const poolId of affectedPools) {
      await repos.ranking.recomputeStandings(poolId)
    }
  })

  // Bust every affected pool's ranking cache first (cheap, synchronous) so the
  // just-finished match's points are reflected immediately — before the slower
  // per-user stats recompute, which would otherwise hold a warm pre-finish
  // ranking cache for later pools and briefly re-hide the match's points.
  for (const poolId of affectedPools) {
    invalidateRankingAggregate(poolId)
  }

  for (const poolId of affectedPools) {
    const unlockedUsers = await statsUnlockRepo.listUnlockedUsers(poolId)
    for (const userId of unlockedUsers) {
      await statsRepo.recomputeSnapshot(poolId, userId)
    }
    invalidateParticipantStatsAggregate(poolId)
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
