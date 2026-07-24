import {
  PerformanceCalculation,
  type PoolOutcome,
} from '../../domain/performance/PerformanceCalculation'
import type {
  PerformanceReadRepository,
  UserPoolFact,
} from '../../domain/performance/PerformanceReadRepository.port'
import type { PerformanceSummary } from '../../domain/performance/PerformanceSummary'
import { Ranking } from '../../domain/ranking/Ranking'
import type {
  PoolStandingRow,
  RankingRepository,
} from '../../domain/ranking/RankingRepository.port'

type Input = { userId: string }

type PoolWinners = { winnerCount: number; winners: Set<string> }

/**
 * Builds the global "Meu desempenho" summary from ~3 batched reads (no per-pool
 * round-trip). Winner determination reuses the domain `Ranking.build` (so the
 * tiebreaker lives in one place); all money math lives in `PerformanceCalculation`.
 */
export class GetMyPerformanceUseCase {
  constructor(
    private readonly perfRepo: PerformanceReadRepository,
    private readonly rankingRepo: RankingRepository,
  ) {}

  async execute({ userId }: Input): Promise<PerformanceSummary> {
    const facts = await this.perfRepo.getUserPoolFacts(userId)
    const closedIds = facts.filter((f) => f.status === 'closed').map((f) => f.poolId)

    const [standings, withdrawnIds] = await Promise.all([
      closedIds.length > 0
        ? this.rankingRepo.getStandingsForPools(closedIds)
        : Promise.resolve<PoolStandingRow[]>([]),
      this.perfRepo.getUserWithdrawnPoolIds(userId),
    ])

    const winnersByPool = groupWinners(standings)
    const withdrawn = new Set(withdrawnIds)
    const outcomes = facts.map((f) => toOutcome(f, userId, winnersByPool, withdrawn))
    return PerformanceCalculation.summarize(outcomes)
  }
}

/** Group standings by pool and resolve the position-1 set via the domain ranking. */
function groupWinners(rows: PoolStandingRow[]): Map<string, PoolWinners> {
  const byPool = new Map<string, PoolStandingRow[]>()
  for (const row of rows) {
    const list = byPool.get(row.poolId) ?? []
    list.push(row)
    byPool.set(row.poolId, list)
  }

  const result = new Map<string, PoolWinners>()
  for (const [poolId, group] of byPool) {
    const ranked = Ranking.build(
      group.map((r) => ({
        userId: r.userId,
        name: r.name,
        totalPoints: r.totalPoints,
        exactMatches: r.exactMatches,
        livePoints: r.totalPoints,
      })),
      '',
    )
    const winners = ranked.filter((e) => e.position === 1)
    result.set(poolId, {
      winnerCount: winners.length,
      winners: new Set(winners.map((w) => w.userId)),
    })
  }
  return result
}

function toOutcome(
  fact: UserPoolFact,
  userId: string,
  winnersByPool: Map<string, PoolWinners>,
  withdrawn: Set<string>,
): PoolOutcome {
  const isClosed = fact.status === 'closed'
  const w = winnersByPool.get(fact.poolId)
  return {
    poolId: fact.poolId,
    isClosed,
    entryFeeCentavos: fact.entryFeeCentavos,
    discountPercent: fact.discountPercent,
    memberCount: fact.memberCount,
    entryPaidCentavos: fact.entryPaidCentavos,
    isWinner: isClosed && (w?.winners.has(userId) ?? false),
    winnerCount: w?.winnerCount ?? 0,
    hasWithdrawal: withdrawn.has(fact.poolId),
    settledAt: fact.settledAt,
    joinedAt: fact.joinedAt,
  }
}
