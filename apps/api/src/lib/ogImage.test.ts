import { describe, expect, it } from 'vitest'
import { fitTitleFontSize } from './ogImage'

describe('fitTitleFontSize', () => {
  it('uses the large ladder for range pools', () => {
    expect(fitTitleFontSize('Hexa 1/8')).toBe(132)
    expect(fitTitleFontSize('Hexa 1/8', false)).toBe(132)
  })

  it('shrinks the headline for single-match pools so the JOGO ÚNICO banner fits', () => {
    // Regression: a short name on a single-match pool used to keep the 132px
    // max size, overflowing the fixed-height hero and overlapping "Criado por".
    expect(fitTitleFontSize('Hexa 1/8', true)).toBeLessThan(fitTitleFontSize('Hexa 1/8'))
  })

  it('keeps every single-match size small enough to clear the banner (<= 84px)', () => {
    const names = ['Hexa 1/8', 'Bolão da Família', 'Bolão dos Brothers do Trabalho', 'x'.repeat(48)]
    for (const name of names) {
      expect(fitTitleFontSize(name, true)).toBeLessThanOrEqual(84)
    }
  })
})
