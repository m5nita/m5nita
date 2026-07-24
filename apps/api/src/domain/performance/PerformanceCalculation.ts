import { PrizeCalculation } from '../prize/PrizeCalculation'
import { Balance } from '../shared/Balance'
import { EntryFee } from '../shared/EntryFee'
import { FeePolicy } from '../shared/FeePolicy'
import { Money } from '../shared/Money'
import type { EvolutionPoint, PerformanceSummary } from './PerformanceSummary'

/**
 * Per-pool outcome the use case assembles (winner facts resolved via `Ranking`,
 * money facts from the read model). `PerformanceCalculation` turns a list of
 * these into the `PerformanceSummary` — this is where every money rule lives.
 */
export type PoolOutcome = {
  poolId: string
  isClosed: boolean
  entryFeeCentavos: number
  discountPercent: number
  memberCount: number
  entryPaidCentavos: number
  isWinner: boolean
  winnerCount: number
  hasWithdrawal: boolean
  settledAt: Date | null
  joinedAt: Date
}

export class PerformanceCalculation {
  private constructor() {}

  static summarize(outcomes: PoolOutcome[]): PerformanceSummary {
    const shares = outcomes.map((o) => PerformanceCalculation.winnerShareOf(o))

    const vitorias = outcomes.filter((o) => o.isClosed && o.isWinner).length
    const derrotas = outcomes.filter((o) => o.isClosed && !o.isWinner).length
    const decided = vitorias + derrotas

    const gasteiC = sumBy(outcomes, (o) => o.entryPaidCentavos)
    const premiosC = sumBy(shares, (s) => s?.centavos ?? 0)
    const aSacarC = sumBy(outcomes, (o, i) =>
      o.isWinner && !o.hasWithdrawal ? (shares[i]?.centavos ?? 0) : 0,
    )

    return {
      participei: outcomes.length,
      vitorias,
      derrotas,
      emAndamento: outcomes.filter((o) => !o.isClosed).length,
      aproveitamento: decided === 0 ? null : vitorias / decided,
      gastei: Money.of(gasteiC),
      premiosConquistados: Money.of(premiosC),
      aSacar: Money.of(aSacarC),
      saldo: Balance.of(premiosC - gasteiC),
      maiorPremio: PerformanceCalculation.maiorPremio(shares),
      evolucao: PerformanceCalculation.evolution(outcomes, shares),
    }
  }

  /** Prize entitlement for a won closed pool; null otherwise. Reuses domain math. */
  private static winnerShareOf(o: PoolOutcome): Money | null {
    if (!o.isClosed || !o.isWinner || o.winnerCount <= 0) return null
    const prizeTotal = PrizeCalculation.calculatePrizeTotal(
      EntryFee.hydrate(o.entryFeeCentavos),
      o.memberCount,
      FeePolicy.from(o.discountPercent),
    )
    return PrizeCalculation.calculateWinnerShare(prizeTotal, o.winnerCount)
  }

  private static maiorPremio(shares: (Money | null)[]): Money | null {
    if (!shares.some((s) => s !== null)) return null
    return Money.of(shares.reduce((max, s) => Math.max(max, s?.centavos ?? 0), 0))
  }

  private static evolution(outcomes: PoolOutcome[], shares: (Money | null)[]): EvolutionPoint[] {
    const indexed = outcomes.map((o, i) => ({ o, share: shares[i] ?? null }))
    indexed.sort((a, b) => orderKey(a.o) - orderKey(b.o))
    let cumulative = 0
    return indexed.map(({ o, share }) => {
      cumulative += (share?.centavos ?? 0) - o.entryPaidCentavos
      return { poolId: o.poolId, settledAt: o.settledAt, cumulativeSaldoCentavos: cumulative }
    })
  }
}

function sumBy<T>(list: T[], fn: (item: T, index: number) => number): number {
  return list.reduce((acc, item, index) => acc + fn(item, index), 0)
}

/** Order pools by settlement time, falling back to join time while em andamento. */
function orderKey(o: PoolOutcome): number {
  return (o.settledAt ?? o.joinedAt).getTime()
}
