import { knockoutContextFor } from '../../domain/match/KnockoutResult'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PredictionRepository,
  PredictionWithMatch,
} from '../../domain/prediction/PredictionRepository.port'
import { RangeScoringPolicy } from '../../domain/scoring/ScoringPolicy'
import { computeLivePoints } from './computeLivePoints'

type Input = {
  userId: string
  poolId: string
}

function toAdvanceSide(value: string | null): 'home' | 'away' | null {
  return value === 'home' || value === 'away' ? value : null
}

export class GetUserPredictionsUseCase {
  constructor(
    private readonly predictionRepo: PredictionRepository,
    private readonly poolRepo: PoolRepository,
  ) {}

  async execute(
    input: Input,
  ): Promise<
    Array<PredictionWithMatch & { category?: number; bonus?: number; advanceBonus?: number }>
  > {
    const pool = await this.poolRepo.findById(input.poolId)

    const predictions = await this.predictionRepo.findByUserPool(input.userId, input.poolId)

    const scoringPolicy = pool?.scoringPolicy() ?? RangeScoringPolicy
    const isSingleMatch = pool?.scope.kind === 'single-match'

    const withLivePoints = predictions.map((p) => {
      const predScores = {
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        advancePick: toAdvanceSide(p.advancePick),
      }
      const matchState = {
        status: p.match.status,
        homeScore: p.match.homeScore,
        awayScore: p.match.awayScore,
        stage: p.match.stage,
        duration: p.match.duration,
        extraTimeHomeScore: p.match.extraTimeHomeScore,
        extraTimeAwayScore: p.match.extraTimeAwayScore,
      }

      const live = computeLivePoints(predScores, matchState, p.points, scoringPolicy)

      let points: number | null
      let category: number | undefined
      let bonus: number | undefined
      let advanceBonus: number | undefined

      if (typeof live === 'object' && live !== null) {
        points = live.total
        if (isSingleMatch) {
          category = live.category
          bonus = live.bonus
        }
        advanceBonus = live.advanceBonus
      } else {
        points = live
        if (points !== null && p.match.homeScore !== null && p.match.awayScore !== null) {
          const knockout = knockoutContextFor(p.match, toAdvanceSide(p.advancePick))
          const s = scoringPolicy.score(
            p.homeScore,
            p.awayScore,
            p.match.homeScore,
            p.match.awayScore,
            knockout,
          )
          if (isSingleMatch) {
            category = s.breakdown?.category
            bonus = s.breakdown?.bonus
          }
          advanceBonus = s.breakdown?.advanceBonus
        }
      }

      return { ...p, points, category, bonus, advanceBonus }
    })

    if (!pool) return withLivePoints

    return withLivePoints.filter((p) => {
      if (pool.scope.kind === 'single-match') {
        return pool.scope.contains({ id: p.match.id, matchday: p.match.matchday })
      }
      if (p.match.competitionId !== pool.competitionId) return false
      return pool.scope.contains({ id: p.match.id, matchday: p.match.matchday })
    })
  }
}
