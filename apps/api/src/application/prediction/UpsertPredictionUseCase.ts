import { Match } from '../../domain/match/Match'
import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import { isKnockout } from '../../domain/match/MatchStage'
import { MatchStatus } from '../../domain/match/MatchStatus'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { type AdvanceSide, Prediction } from '../../domain/prediction/Prediction'
import { PredictionError } from '../../domain/prediction/PredictionError'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'

type Input = {
  userId: string
  poolId: string
  matchId: string
  homeScore: number
  awayScore: number
  advancePick?: AdvanceSide | null
}

export class UpsertPredictionUseCase {
  constructor(
    private readonly predictionRepo: PredictionRepository,
    private readonly poolRepo: PoolRepository,
    private readonly matchRepo: MatchRepository,
    private readonly clock: Clock,
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

    const matchData = await this.matchRepo.findById(input.matchId)
    if (!matchData) {
      throw new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado')
    }
    const match = new Match(
      matchData.id,
      matchData.competitionId,
      matchData.matchDate,
      matchData.matchday,
      MatchStatus.from(matchData.status),
      matchData.homeScore,
      matchData.awayScore,
    )
    if (!Prediction.canSubmitFor(match, this.clock.now())) {
      throw new PredictionError('MATCH_STARTED', 'Não é possível palpitar após o início do jogo')
    }

    const existing = await this.predictionRepo.findByUserPoolMatch(
      input.userId,
      input.poolId,
      input.matchId,
    )

    // The advance pick is only meaningful for knockout matches; drop it otherwise.
    const advancePick = isKnockout(matchData.stage) ? (input.advancePick ?? null) : null

    const prediction = new Prediction(
      existing?.id ?? null,
      input.userId,
      input.poolId,
      input.matchId,
      input.homeScore,
      input.awayScore,
      existing?.points ?? null,
      advancePick,
    )

    return this.predictionRepo.save(prediction)
  }
}
