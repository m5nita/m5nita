import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
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
 * Unlocked → the visual blocks (the predictor profile included).
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
  blocks: ['ranking', 'hitRate', 'efficiency', 'evolution', 'profile'],
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
 * per-match series, plus the viewer's own finished predictions (read-time,
 * bounded); a freshly-unlocked user's snapshot is bootstrapped once on first
 * read.
 */
export class GetParticipantStatsUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly statsUnlockRepo: StatsUnlockRepository,
    private readonly price: StatsUnlockPrice,
    private readonly statsRepo: StatsRepository,
    private readonly loadPoolAggregate: (poolId: string) => Promise<PoolStatsAggregateRow[]>,
    private readonly loadPoolMatches: (poolId: string) => Promise<PoolMatchPointsRow[]>,
  ) {}

  async execute(input: { userId: string; poolId: string }): Promise<ParticipantStatsResult> {
    const pool = await this.poolRepo.findById(input.poolId)
    if (!pool) throw new StatsError('NOT_FOUND', 'Bolão não encontrado')

    const isMember = await this.poolRepo.isMember(input.poolId, input.userId)
    if (!isMember) throw new StatsError('NOT_MEMBER', 'Você não participa deste bolão')

    // Entitlement is checked before scope on purpose: someone who already paid
    // keeps access even on a pool whose scope no longer offers statistics.
    if (!(await this.statsUnlockRepo.isUnlocked(input.userId, input.poolId))) {
      if (!pool.supportsParticipantStats()) {
        throw new StatsError(
          'SCOPE_UNSUPPORTED',
          'Estatísticas estão disponíveis apenas em bolões de campeonato completo',
        )
      }
      return {
        unlocked: false,
        price: { centavos: this.price.centavos, formatted: this.price.formatted() },
        teaser: TEASER,
      }
    }

    const viewer = await this.loadViewerSnapshot(input.poolId, input.userId)
    const [aggregate, poolMatches, profileFacts] = await Promise.all([
      this.loadPoolAggregate(input.poolId),
      this.loadPoolMatches(input.poolId),
      this.statsRepo.viewerFinishedPredictions(input.poolId, input.userId),
    ])

    const blocks = ParticipantPoolStats.build({
      viewerUserId: input.userId,
      viewer,
      aggregate,
      poolMatches,
      profileFacts,
      scoringPolicy: pool.scoringPolicy(),
    })

    return { unlocked: true, blocks }
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
