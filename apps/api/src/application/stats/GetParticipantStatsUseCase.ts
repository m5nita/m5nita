import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { ParticipantPoolStats, type StatsBlocks } from '../../domain/stats/ParticipantPoolStats'
import {
  type PendingMatchImpact,
  PendingMatchImpactPolicy,
} from '../../domain/stats/PendingMatchImpactPolicy'
import { StatsError } from '../../domain/stats/StatsError'
import type {
  ParticipantStatsRow,
  PoolStatsAggregateRow,
  StatsRepository,
} from '../../domain/stats/StatsRepository.port'
import type { StatsUnlockPrice } from '../../domain/stats/StatsUnlockPrice'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'
import { type Suggestion, SuggestionPolicy } from '../../domain/stats/SuggestionPolicy'

export type StatsTeaser = {
  blocks: string[]
  headline: string
}

/**
 * The gated read result. Locked → teaser + price only (no computed statistic).
 * Unlocked → the four blocks + pending-match impact; `suggestions` is populated
 * by US4.
 */
export type ParticipantStatsResult =
  | {
      unlocked: false
      price: { centavos: number; formatted: string }
      teaser: StatsTeaser
    }
  | {
      unlocked: true
      blocks: StatsBlocks
      pendingImpact: PendingMatchImpact[]
      suggestions: Suggestion[]
    }

const TEASER: StatsTeaser = {
  blocks: ['hitRateVsAverage', 'rankingEvolution', 'strengthsWeaknesses', 'pointsLeftOnTable'],
  headline: 'Veja como você se compara ao bolão',
}

const EMPTY_ROW: ParticipantStatsRow = {
  finishedCount: 0,
  exactCount: 0,
  resultCount: 0,
  pointsTotal: 0,
  homeCorrect: 0,
  homeTotal: 0,
  awayCorrect: 0,
  awayTotal: 0,
  lowGoalsCorrect: 0,
  lowGoalsTotal: 0,
  highGoalsCorrect: 0,
  highGoalsTotal: 0,
  position: null,
  prevPosition: null,
}

/**
 * Server-side gate for a pool's participant statistics. Requires membership +
 * entitlement. The front never decides access nor computes price. Unlocked
 * reads are served from the persisted snapshot + the cached pool aggregate
 * (no per-request re-aggregation); a freshly-unlocked user's snapshot is
 * bootstrapped once on first read.
 */
export class GetParticipantStatsUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly statsUnlockRepo: StatsUnlockRepository,
    private readonly price: StatsUnlockPrice,
    private readonly statsRepo: StatsRepository,
    private readonly loadPoolAggregate: (poolId: string) => Promise<PoolStatsAggregateRow[]>,
    private readonly matchRepo: MatchRepository,
    private readonly predictionRepo: PredictionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: { userId: string; poolId: string }): Promise<ParticipantStatsResult> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) throw new StatsError('NOT_FOUND', 'Bolão não encontrado')

    const isMember = await this.poolRepo.isMember(input.poolId, input.userId)
    if (!isMember) throw new StatsError('NOT_MEMBER', 'Você não participa deste bolão')

    if (!(await this.statsUnlockRepo.isUnlocked(input.userId, input.poolId))) {
      return {
        unlocked: false,
        price: { centavos: this.price.centavos, formatted: this.price.formatted() },
        teaser: TEASER,
      }
    }

    const viewer = await this.loadViewerSnapshot(input.poolId, input.userId)
    const [aggregate, rounds] = await Promise.all([
      this.loadPoolAggregate(input.poolId),
      this.statsRepo.roundPoints(input.poolId, input.userId),
    ])

    const scoringPolicy = pool.scoringPolicy()
    const blocks = ParticipantPoolStats.build({ viewer, aggregate, rounds, scoringPolicy })

    const pendingImpact = await this.buildPendingImpact(pool, input.userId, {
      viewerPoints: viewer.pointsTotal,
      // ALL members' points (not just unlocked) — rival density reflects the
      // whole race. Anonymized numbers only; no individual prediction.
      memberPoints: aggregate.map((a) => a.pointsTotal),
      maxPoints: scoringPolicy.maxPoints(),
    })

    const suggestions = SuggestionPolicy.suggest(viewer)

    return { unlocked: true, blocks, pendingImpact, suggestions }
  }

  // The viewer's own not-yet-started matches (predicted or not), ranked by
  // impact, each flagged submit/change. Reads only the viewer's prediction
  // existence — never another member's prediction (FR-016/019/021).
  private async buildPendingImpact(
    pool: NonNullable<Awaited<ReturnType<PoolRepository['findById']>>>,
    userId: string,
    ctx: { viewerPoints: number; memberPoints: number[]; maxPoints: number },
  ): Promise<PendingMatchImpact[]> {
    const [pending, predicted] = await Promise.all([
      this.matchRepo.findPendingFor(pool.unfinishedMatchesQuery(), this.clock.now()),
      this.predictionRepo.findByUserPool(userId, pool.id),
    ])
    const predictedIds = new Set(predicted.map((p) => p.matchId))

    return PendingMatchImpactPolicy.rank(
      pending.map((m) => ({
        matchId: m.id,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        matchDate: m.matchDate,
        hasPrediction: predictedIds.has(m.id),
      })),
      ctx,
    )
  }

  // Serve the persisted snapshot; bootstrap it once if a just-unlocked user has
  // none yet. Steady state never recomputes here (match-finish keeps it fresh).
  private async loadViewerSnapshot(poolId: string, userId: string): Promise<ParticipantStatsRow> {
    const existing = await this.statsRepo.participantRow(poolId, userId)
    if (existing) return existing
    await this.statsRepo.recomputeSnapshot(poolId, userId)
    return (await this.statsRepo.participantRow(poolId, userId)) ?? EMPTY_ROW
  }
}
