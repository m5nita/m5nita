import { describe, expect, it } from 'vitest'
import { AdvanceBonus, type KnockoutContext } from './AdvanceBonus'
import { Score } from './Score'

function ctx(over: Partial<KnockoutContext>): KnockoutContext {
  return { pastRegularTime: true, advancingSide: 'home', predictedAdvance: 'home', ...over }
}

describe('AdvanceBonus.apply', () => {
  const exactDraw = Score.calculate(1, 1, 1, 1) // 10 (the 90' of any overtime match is a draw)

  it('adds +2 when settled in overtime and the pick names the advancing side', () => {
    const s = AdvanceBonus.apply(
      exactDraw,
      ctx({ predictedAdvance: 'home', advancingSide: 'home' }),
    )
    expect(s.points).toBe(12)
    expect(s.breakdown?.advanceBonus).toBe(2)
  })

  it('applies equally whether the overtime was extra time or penalties', () => {
    // both reach this function as pastRegularTime: true; behavior is identical
    const s = AdvanceBonus.apply(exactDraw, ctx({}))
    expect(s.points).toBe(12)
  })

  it('adds nothing when the pick names the wrong side', () => {
    const s = AdvanceBonus.apply(
      exactDraw,
      ctx({ predictedAdvance: 'away', advancingSide: 'home' }),
    )
    expect(s.points).toBe(10)
  })

  it('adds nothing when there is no pick', () => {
    expect(AdvanceBonus.apply(exactDraw, ctx({ predictedAdvance: null })).points).toBe(10)
  })

  it('adds nothing when the match stayed in regular time', () => {
    expect(AdvanceBonus.apply(exactDraw, ctx({ pastRegularTime: false })).points).toBe(10)
  })

  it('adds nothing when there is no knockout context', () => {
    expect(AdvanceBonus.apply(exactDraw, undefined).points).toBe(10)
  })

  it('stacks on a non-exact draw scoreline (0-0 vs 1-1)', () => {
    const s = AdvanceBonus.apply(Score.calculate(0, 0, 1, 1), ctx({}))
    expect(s.points).toBe(7) // 5 + 2
  })

  it('still pays the bonus when the scoreline missed (predicted a winner at 90, real was a draw)', () => {
    const s = AdvanceBonus.apply(Score.calculate(2, 1, 1, 1), ctx({ predictedAdvance: 'home' }))
    expect(s.points).toBe(2) // 0 + 2
  })
})
