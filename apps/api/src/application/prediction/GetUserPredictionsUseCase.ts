import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PredictionRepository,
  PredictionWithMatch,
} from '../../domain/prediction/PredictionRepository.port'

type Input = {
  userId: string
  poolId: string
}

export class GetUserPredictionsUseCase {
  constructor(
    private readonly predictionRepo: PredictionRepository,
    private readonly poolRepo: PoolRepository,
  ) {}

  async execute(input: Input): Promise<PredictionWithMatch[]> {
    const pool = await this.poolRepo.findById(input.poolId)

    const predictions = await this.predictionRepo.findByUserPool(input.userId, input.poolId)

    if (!pool) return predictions

    return predictions.filter((p) => {
      if (p.match.competitionId !== pool.competitionId) return false

      if (pool.matchdayRange !== null && p.match.matchday !== null) {
        if (!pool.matchdayRange.contains(p.match.matchday)) {
          return false
        }
      }

      return true
    })
  }
}
