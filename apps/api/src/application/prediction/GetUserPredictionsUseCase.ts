import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PredictionRepository,
  PredictionWithMatch,
} from '../../domain/prediction/PredictionRepository.port'
import { computeLivePoints } from './computeLivePoints'

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

    const withLivePoints = predictions.map((p) => ({
      ...p,
      points: computeLivePoints(
        { homeScore: p.homeScore, awayScore: p.awayScore },
        { status: p.match.status, homeScore: p.match.homeScore, awayScore: p.match.awayScore },
        p.points,
      ),
    }))

    if (!pool) return withLivePoints

    return withLivePoints.filter((p) => {
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
