import type { MatchPredictionsResponse } from '@m5nita/shared'
import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PredictionError } from '../../domain/prediction/PredictionError'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'

type Input = {
  viewerUserId: string
  poolId: string
  matchId: string
}

export class GetMatchPredictionsUseCase {
  constructor(
    private readonly predictionRepo: PredictionRepository,
    private readonly poolRepo: PoolRepository,
    private readonly matchRepo: MatchRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: Input): Promise<MatchPredictionsResponse> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) {
      throw new PredictionError('POOL_NOT_FOUND', 'Bolão não encontrado')
    }

    const match = await this.matchRepo.findById(input.matchId)
    if (!match) {
      throw new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado')
    }

    if (match.competitionId !== pool.competitionId) {
      throw new PredictionError('MATCH_NOT_IN_POOL', 'Este jogo não pertence ao bolão')
    }

    const isMember = await this.poolRepo.isMember(input.poolId, input.viewerUserId)
    if (!isMember) {
      throw new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão')
    }

    const isLocked =
      match.status === 'live' ||
      match.status === 'finished' ||
      match.matchDate.getTime() <= this.clock.now().getTime()
    if (!isLocked) {
      throw new PredictionError('MATCH_NOT_LOCKED', 'Este jogo ainda não está bloqueado')
    }

    const [predictions, members] = await Promise.all([
      this.predictionRepo.findByPoolMatch(input.poolId, input.matchId),
      this.poolRepo.getMembers(input.poolId),
    ])

    const predictorIds = new Set(predictions.map((p) => p.userId))
    const viewerDidPredict = predictorIds.has(input.viewerUserId)

    const predictors = predictions
      .filter((p) => p.userId !== input.viewerUserId)
      .map((p) => ({
        userId: p.userId,
        name: p.name,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        points: p.points,
      }))

    const nonPredictors = members
      .filter((m) => m.userId !== input.viewerUserId && !predictorIds.has(m.userId))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .map((m) => ({ userId: m.userId, name: m.name }))

    return {
      matchId: input.matchId,
      isLocked: true,
      totalMembers: members.length,
      viewerIncluded: true,
      viewerDidPredict,
      predictors,
      nonPredictors,
    }
  }
}
