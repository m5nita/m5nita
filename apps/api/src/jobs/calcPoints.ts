import { getContainer } from '../container'
import { Score } from '../domain/scoring/Score'

export async function calcPointsForMatch(matchId: string) {
  const { matchRepo, predictionRepo } = getContainer()

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

  for (const pred of predictions) {
    const score = Score.calculate(
      pred.homeScore,
      pred.awayScore,
      matchData.homeScore,
      matchData.awayScore,
    )

    await predictionRepo.updatePoints(pred.id!, score.points)
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
