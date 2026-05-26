import { getContainer } from '../container'
import { RangeScoringPolicy, type ScoringPolicy } from '../domain/scoring/ScoringPolicy'

export async function calcPointsForMatch(matchId: string) {
  const { matchRepo, predictionRepo, poolRepo } = getContainer()

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
    const points = policy.score(
      pred.homeScore,
      pred.awayScore,
      matchData.homeScore,
      matchData.awayScore,
    ).points

    if (pred.id) {
      await predictionRepo.updatePoints(pred.id, points)
    }
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
