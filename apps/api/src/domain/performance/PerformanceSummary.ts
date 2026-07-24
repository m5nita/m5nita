import type { Balance } from '../shared/Balance'
import type { Money } from '../shared/Money'

/** One cumulative point of the user's saldo curve (one per pool, chronological). */
export type EvolutionPoint = {
  poolId: string
  settledAt: Date | null
  cumulativeSaldoCentavos: number
}

/**
 * The computed global performance aggregate. Money quantities are value objects
 * (`Money`/`Balance`); the HTTP layer maps them to primitive centavos.
 */
export type PerformanceSummary = {
  participei: number
  vitorias: number
  derrotas: number
  emAndamento: number
  /** Win rate over decided pools as a ratio (0..1); null when none are decided. */
  aproveitamento: number | null
  gastei: Money
  premiosConquistados: Money
  aSacar: Money
  /** Net career position (may be negative). */
  saldo: Balance
  maiorPremio: Money | null
  evolucao: EvolutionPoint[]
}
