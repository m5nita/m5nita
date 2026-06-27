import { afterEach, describe, expect, it, vi } from 'vitest'
import { shareRankingImage } from './shareRanking'

afterEach(() => vi.restoreAllMocks())

function mockPngFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/png' }),
    })),
  )
}

describe('shareRankingImage', () => {
  it('uses navigator.share with the file when supported', async () => {
    mockPngFetch()
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { canShare: () => true, share })
    await shareRankingImage('pool-1', 'Bolão')
    expect(share).toHaveBeenCalledOnce()
  })

  it('falls back to a download when file-share is unsupported', async () => {
    mockPngFetch()
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await shareRankingImage('pool-1', 'Bolão')
    expect(click).toHaveBeenCalled()
  })
})
