import { getContainer } from '../container'
import { knockoutContextFor } from '../domain/match/KnockoutResult'
import { RangeScoringPolicy, type ScoringPolicy } from '../domain/scoring/ScoringPolicy'
import { invalidateRankingAggregate } from '../services/rankingCache'
import { invalidateParticipantStatsAggregate } from '../services/statsCache'

export async function calcPointsForMatch(matchId: string) {
  const { matchRepo, predictionRepo, poolRepo, rankingRepo, statsRepo, statsUnlockRepo } =
    getContainer()

  const matchData = await matchRepo.findById(matchId)

  if (!matchData || matchData.status !== 'finished') {
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
      await predictionRepo.updatePoints(pred.id, points)
    }
  }

  // Points just changed for these pools — recompute their denormalized standings
  // and drop the cached copy so the next ranking read reflects the finished match.
  // Then refresh the per-user stats snapshot for the (small) set of unlocked
  // participants and bust the sibling stats aggregate, mirroring the ranking path.
  for (const poolId of new Set(predictions.map((p) => p.poolId))) {
    await rankingRepo.recomputeStandings(poolId)
    invalidateRankingAggregate(poolId)

    const unlockedUsers = await statsUnlockRepo.listUnlockedUsers(poolId)
    for (const userId of unlockedUsers) {
      await statsRepo.recomputeSnapshot(poolId, userId)
    }
    invalidateParticipantStatsAggregate(poolId)
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
