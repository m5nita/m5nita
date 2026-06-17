import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import type { PendingMatchInput } from '../../domain/stats/ClimbPolicy'
import { ParticipantPoolStats, type StatsBlocks } from '../../domain/stats/ParticipantPoolStats'
import { StatsError } from '../../domain/stats/StatsError'
import type {
  ParticipantStatsRow,
  PoolMatchPointsRow,
  PoolStatsAggregateRow,
  StatsRepository,
} from '../../domain/stats/StatsRepository.port'
import type { StatsUnlockPrice } from '../../domain/stats/StatsUnlockPrice'
import type { StatsUnlockRepository } from '../../domain/stats/StatsUnlockRepository.port'

export type StatsTeaser = {
  blocks: string[]
  headline: string
}

/**
 * The gated read result. Locked → teaser + price only (no computed statistic).
 * Unlocked → the visual blocks (profile and climb included).
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
    }

const TEASER: StatsTeaser = {
  blocks: ['ranking', 'hitRate', 'efficiency', 'evolution', 'profile', 'climb'],
  headline: 'Veja como você se compara ao bolão',
}

const EMPTY_ROW: ParticipantStatsRow = {
  finishedCount: 0,
  exactCount: 0,
  resultCount: 0,
  pointsTotal: 0,
  position: null,
  prevPosition: null,
}

/**
 * Server-side gate for a pool's participant statistics. Requires membership +
 * entitlement. The front never decides access nor computes price. Unlocked
 * reads are served from the persisted snapshot + the cached pool aggregate and
 * per-match series, plus the viewer's own finished predictions and not-yet-
 * started matches (read-time, bounded); a freshly-unlocked user's snapshot is
 * bootstrapped once on first read.
 */
export class GetParticipantStatsUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly statsUnlockRepo: StatsUnlockRepository,
    private readonly price: StatsUnlockPrice,
    private readonly statsRepo: StatsRepository,
    private readonly loadPoolAggregate: (poolId: string) => Promise<PoolStatsAggregateRow[]>,
    private readonly loadPoolMatches: (poolId: string) => Promise<PoolMatchPointsRow[]>,
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
    const [aggregate, poolMatches, profileFacts, pendingMatches] = await Promise.all([
      this.loadPoolAggregate(input.poolId),
      this.loadPoolMatches(input.poolId),
      this.statsRepo.viewerFinishedPredictions(input.poolId, input.userId),
      this.loadPendingMatches(pool, input.userId),
    ])

    const blocks = ParticipantPoolStats.build({
      viewerUserId: input.userId,
      viewer,
      aggregate,
      poolMatches,
      profileFacts,
      pendingMatches,
      scoringPolicy: pool.scoringPolicy(),
    })

    return { unlocked: true, blocks }
  }

  // The viewer's own not-yet-started matches (predicted or not), each flagged
  // submit/change for the climb's next-match step. Reads only the viewer's
  // prediction existence — never another member's prediction (FR-018/019).
  private async loadPendingMatches(
    pool: NonNullable<Awaited<ReturnType<PoolRepository['findById']>>>,
    userId: string,
  ): Promise<PendingMatchInput[]> {
    const [pending, predicted] = await Promise.all([
      this.matchRepo.findPendingFor(pool.unfinishedMatchesQuery(), this.clock.now()),
      this.predictionRepo.findByUserPool(userId, pool.id),
    ])
    const predictedIds = new Set(predicted.map((p) => p.matchId))

    return pending.map((m) => ({
      matchId: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      matchDate: m.matchDate,
      hasPrediction: predictedIds.has(m.id),
    }))
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
