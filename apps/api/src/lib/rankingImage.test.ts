import { describe, expect, it } from 'vitest'
import { rankingImageDimensions, renderRankingOgPng } from './rankingImage'

describe('rankingImageDimensions', () => {
  it('is 1080 wide and at least 1350 tall for small pools', () => {
    expect(rankingImageDimensions(4)).toEqual({ width: 1080, height: 1350 })
  })
  it('extends height for large pools', () => {
    expect(rankingImageDimensions(40).height).toBeGreaterThan(1350)
    expect(rankingImageDimensions(40).width).toBe(1080)
  })
})

describe('renderRankingOgPng', () => {
  it('renders a PNG buffer', async () => {
    const png = await renderRankingOgPng({
      poolName: 'Bolão da Galera',
      competitionName: 'Copa do Mundo 2026',
      prizeCentavos: 33250,
      rows: [
        { position: 1, name: 'Igor', points: 37, exactMatches: 2, isViewer: true },
        { position: 2, name: 'Ana', points: 20, exactMatches: 1, isViewer: false },
      ],
    })
    expect(png).toBeInstanceOf(Buffer)
    // PNG magic number: 89 50 4E 47
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  })
})
