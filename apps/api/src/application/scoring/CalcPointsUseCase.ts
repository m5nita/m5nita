import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'

export type CalcPointsDeps = {
  matchRepo: MatchRepository
  predictionRepo: PredictionRepository
}

export class CalcPointsUseCase {
  constructor(private readonly deps: CalcPointsDeps) {}

  async execute(input: { matchId: string }): Promise<void> {
    const match = await this.deps.matchRepo.findById(input.matchId)

    if (!match || match.status !== 'finished') {
      console.log(`[CalcPoints] Match ${input.matchId} not finished, skipping`)
      return
    }

    if (match.homeScore == null || match.awayScore == null) {
      console.log(`[CalcPoints] Match ${input.matchId} missing scores, skipping`)
      return
    }

    const predictions = await this.deps.predictionRepo.findByMatch(input.matchId)

    for (const prediction of predictions) {
      prediction.calculatePoints(match.homeScore, match.awayScore)

      if (prediction.id && prediction.points != null) {
        await this.deps.predictionRepo.updatePoints(prediction.id, prediction.points)
      }
    }

    console.log(
      `[CalcPoints] Processed ${predictions.length} predictions for match ${input.matchId}`,
    )
  }
}
