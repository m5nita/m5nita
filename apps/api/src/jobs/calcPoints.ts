import { getContainer } from '../container'
import { Score } from '../domain/scoring/Score'
import { SingleMatchScore } from '../domain/scoring/SingleMatchScore'

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

  const poolScopeCache = new Map<string, boolean>() // poolId → isSingleMatch
  async function isSingleMatch(poolId: string): Promise<boolean> {
    const cached = poolScopeCache.get(poolId)
    if (cached !== undefined) return cached
    const pool = await poolRepo.findById(poolId)
    const result = pool?.scope.kind === 'single-match'
    poolScopeCache.set(poolId, result)
    return result
  }

  for (const pred of predictions) {
    const singleMatch = await isSingleMatch(pred.poolId)
    const points = singleMatch
      ? SingleMatchScore.calculate(
          pred.homeScore,
          pred.awayScore,
          matchData.homeScore,
          matchData.awayScore,
        ).total
      : Score.calculate(pred.homeScore, pred.awayScore, matchData.homeScore, matchData.awayScore)
          .points

    if (pred.id) {
      await predictionRepo.updatePoints(pred.id, points)
    }
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
