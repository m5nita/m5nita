import type { MatchPredictionsResponse } from '@m5nita/shared'
import { Match } from '../../domain/match/Match'
import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import { MatchStatus } from '../../domain/match/MatchStatus'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { Prediction } from '../../domain/prediction/Prediction'
import { PredictionError } from '../../domain/prediction/PredictionError'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { computeLivePoints, type LivePoints } from './computeLivePoints'

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
    // These three reads are independent — run them together, then validate in
    // the original precedence order (POOL → MATCH → IN_POOL → MEMBER → LOCKED).
    const [pool, matchData, isMember] = await Promise.all([
      this.poolRepo.findById(input.poolId),
      this.matchRepo.findById(input.matchId),
      this.poolRepo.isMember(input.poolId, input.viewerUserId),
    ])

    if (!pool) {
      throw new PredictionError('POOL_NOT_FOUND', 'Bolão não encontrado')
    }

    if (!matchData) {
      throw new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado')
    }

    if (matchData.competitionId !== pool.competitionId) {
      throw new PredictionError('MATCH_NOT_IN_POOL', 'Este jogo não pertence ao bolão')
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

    const scoringPolicy = pool.scoringPolicy()
    const includesBonus = pool.scope.kind === 'single-match'

    if (!isMember) {
      throw new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão')
    }

    if (Prediction.canSubmitFor(match, this.clock.now())) {
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
      .map((p) => {
        const predScores = { homeScore: p.homeScore, awayScore: p.awayScore }
        const matchState = {
          status: match.status.value,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        }

        let points: number | null
        let category: number | undefined
        let bonus: number | undefined

        const live: LivePoints = computeLivePoints(predScores, matchState, p.points, scoringPolicy)

        if (typeof live === 'object' && live !== null) {
          points = live.total
          category = live.category
          bonus = live.bonus
        } else {
          points = live
          if (
            includesBonus &&
            points !== null &&
            match.homeScore !== null &&
            match.awayScore !== null
          ) {
            const s = scoringPolicy.score(
              p.homeScore,
              p.awayScore,
              match.homeScore,
              match.awayScore,
            )
            category = s.breakdown?.category
            bonus = s.breakdown?.bonus
          }
        }

        return {
          userId: p.userId,
          name: p.name,
          homeScore: p.homeScore,
          awayScore: p.awayScore,
          points,
          category,
          bonus,
        }
      })
      .sort((a, b) => {
        const diff = (b.points ?? -1) - (a.points ?? -1)
        if (diff !== 0) return diff
        return (a.name ?? '').localeCompare(b.name ?? '')
      })

    const nonPredictors = members
      .filter((m) => m.userId !== input.viewerUserId && !predictorIds.has(m.userId))
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
      .map((m) => ({ userId: m.userId, name: m.name }))

    return {
      matchId: input.matchId,
      matchStatus: match.status.value as MatchPredictionsResponse['matchStatus'],
      isLocked: true,
      totalMembers: members.length,
      viewerIncluded: true,
      viewerDidPredict,
      predictors,
      nonPredictors,
    }
  }
}
