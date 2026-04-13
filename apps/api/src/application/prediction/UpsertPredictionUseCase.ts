import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { Prediction } from '../../domain/prediction/Prediction'
import { PredictionError } from '../../domain/prediction/PredictionError'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'

type Input = {
  userId: string
  poolId: string
  matchId: string
  homeScore: number
  awayScore: number
}

export class UpsertPredictionUseCase {
  constructor(
    private readonly predictionRepo: PredictionRepository,
    private readonly poolRepo: PoolRepository,
    private readonly matchRepo: MatchRepository,
  ) {}

  async execute(input: Input): Promise<Prediction> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) {
      throw new PredictionError('POOL_NOT_FOUND', 'Bolão não encontrado')
    }
    if (!pool.canAcceptPredictions()) {
      throw new PredictionError('POOL_CLOSED', 'Não é possível palpitar em um bolão finalizado')
    }

    const isMember = await this.poolRepo.isMember(input.poolId, input.userId)
    if (!isMember) {
      throw new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão')
    }

    const match = await this.matchRepo.findById(input.matchId)
    if (!match) {
      throw new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado')
    }
    if (!Prediction.canSubmit(match.matchDate)) {
      throw new PredictionError('MATCH_STARTED', 'Não é possível palpitar após o início do jogo')
    }

    const existing = await this.predictionRepo.findByUserPoolMatch(
      input.userId,
      input.poolId,
      input.matchId,
    )

    const prediction = new Prediction(
      existing?.id ?? null,
      input.userId,
      input.poolId,
      input.matchId,
      input.homeScore,
      input.awayScore,
      existing?.points ?? null,
    )

    return this.predictionRepo.save(prediction)
  }
}
