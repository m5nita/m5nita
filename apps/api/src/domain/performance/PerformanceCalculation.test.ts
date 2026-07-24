import { describe, expect, it } from 'vitest'
import { PerformanceCalculation, type PoolOutcome } from './PerformanceCalculation'

// Standard 5% fee: entryFee 5000 × 10 members × 0.95 = 47500 prize total.
// A single winner therefore takes 47500; a tie of 2 takes 23750 each.
function outcome(overrides: Partial<PoolOutcome> = {}): PoolOutcome {
  return {
    poolId: 'p',
    isClosed: true,
    entryFeeCentavos: 5000,
    discountPercent: 0,
    memberCount: 10,
    entryPaidCentavos: 5000,
    isWinner: false,
    winnerCount: 0,
    hasWithdrawal: false,
    settledAt: new Date('2026-05-01T00:00:00.000Z'),
    joinedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  }
}

describe('PerformanceCalculation.summarize', () => {
  it('returns an empty summary for no pools', () => {
    const s = PerformanceCalculation.summarize([])
    expect(s.participei).toBe(0)
    expect(s.aproveitamento).toBeNull()
    expect(s.gastei.centavos).toBe(0)
    expect(s.saldo.centavos).toBe(0)
    expect(s.maiorPremio).toBeNull()
    expect(s.evolucao).toEqual([])
  })

  it('counts participation, wins, losses and em-andamento', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: true, winnerCount: 1 }),
      outcome({ poolId: 'b', isWinner: false }),
      outcome({ poolId: 'c', isClosed: false, settledAt: null }),
    ])
    expect(s.participei).toBe(3)
    expect(s.vitorias).toBe(1)
    expect(s.derrotas).toBe(1)
    expect(s.emAndamento).toBe(1)
    expect(s.aproveitamento).toBe(0.5)
  })

  it('reports aproveitamento as null when no pool is decided', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isClosed: false, settledAt: null }),
      outcome({ poolId: 'b', isClosed: false, settledAt: null }),
    ])
    expect(s.vitorias).toBe(0)
    expect(s.derrotas).toBe(0)
    expect(s.aproveitamento).toBeNull()
  })

  it('computes saldo as prêmios − gastei (positive)', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: true, winnerCount: 1 }), // +47500, paid 5000
      outcome({ poolId: 'b', isWinner: false }), // paid 5000
    ])
    expect(s.gastei.centavos).toBe(10000)
    expect(s.premiosConquistados.centavos).toBe(47500)
    expect(s.saldo.centavos).toBe(37500)
    expect(s.saldo.isPositive()).toBe(true)
  })

  it('allows a negative saldo (prejuízo)', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: false }),
      outcome({ poolId: 'b', isWinner: false }),
    ])
    expect(s.premiosConquistados.centavos).toBe(0)
    expect(s.gastei.centavos).toBe(10000)
    expect(s.saldo.centavos).toBe(-10000)
    expect(s.saldo.isNegative()).toBe(true)
  })

  it('splits the prize among co-winners on a tie', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: true, winnerCount: 2 }),
    ])
    expect(s.vitorias).toBe(1)
    expect(s.premiosConquistados.centavos).toBe(23750)
  })

  it('excludes already-withdrawn prizes from a sacar but not from prêmios', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: true, winnerCount: 1, hasWithdrawal: true }),
      outcome({ poolId: 'b', isWinner: true, winnerCount: 1, hasWithdrawal: false }),
    ])
    expect(s.premiosConquistados.centavos).toBe(95000)
    expect(s.aSacar.centavos).toBe(47500)
  })

  it('counts a free pool in the record but adds nothing to money', () => {
    const s = PerformanceCalculation.summarize([
      outcome({
        poolId: 'a',
        isWinner: true,
        winnerCount: 1,
        entryFeeCentavos: 0,
        entryPaidCentavos: 0,
      }),
    ])
    expect(s.vitorias).toBe(1)
    expect(s.gastei.centavos).toBe(0)
    expect(s.premiosConquistados.centavos).toBe(0)
    expect(s.saldo.centavos).toBe(0)
  })

  it('reports the largest single prize as maior prêmio', () => {
    const s = PerformanceCalculation.summarize([
      outcome({ poolId: 'a', isWinner: true, winnerCount: 1 }), // 47500
      outcome({ poolId: 'b', isWinner: true, winnerCount: 1, entryFeeCentavos: 3000 }), // 28500
    ])
    expect(s.maiorPremio?.centavos).toBe(47500)
  })

  it('has no maior prêmio when the user never won', () => {
    const s = PerformanceCalculation.summarize([outcome({ isWinner: false })])
    expect(s.maiorPremio).toBeNull()
  })

  it('builds a cumulative saldo curve in chronological order', () => {
    const s = PerformanceCalculation.summarize([
      // later win, listed first to prove it gets sorted by settledAt
      outcome({
        poolId: 'b',
        isWinner: true,
        winnerCount: 1,
        settledAt: new Date('2026-05-10T00:00:00.000Z'),
      }),
      outcome({ poolId: 'a', isWinner: false, settledAt: new Date('2026-05-01T00:00:00.000Z') }),
    ])
    expect(s.evolucao.map((p) => [p.poolId, p.cumulativeSaldoCentavos])).toEqual([
      ['a', -5000], // -5000 entry
      ['b', 37500], // -5000 + (47500 - 5000)
    ])
  })

  it('reconciles saldo with the sum of (winnerShare − entryPaid)', () => {
    const outcomes = [
      outcome({ poolId: 'a', isWinner: true, winnerCount: 1 }),
      outcome({ poolId: 'b', isWinner: false }),
      outcome({ poolId: 'c', isWinner: true, winnerCount: 2 }),
      outcome({ poolId: 'd', isClosed: false, settledAt: null }),
    ]
    const s = PerformanceCalculation.summarize(outcomes)
    // a: +47500-5000, b: -5000, c: +23750-5000, d: -5000
    const expected = 47500 - 5000 + -5000 + (23750 - 5000) + -5000
    expect(s.saldo.centavos).toBe(expected)
    expect(s.saldo.centavos).toBe(s.premiosConquistados.centavos - s.gastei.centavos)
    expect(s.vitorias + s.derrotas).toBe(outcomes.filter((o) => o.isClosed).length)
  })
})
