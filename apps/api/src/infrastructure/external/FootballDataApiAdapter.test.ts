import { afterEach, describe, expect, it, vi } from 'vitest'
import { FootballDataApiAdapter } from './FootballDataApiAdapter'

function stubFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  const fetchMock = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.body ?? {},
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('FootballDataApiAdapter', () => {
  it('fetchLiveMatches queries the full dateFrom..dateTo window with the auth token', async () => {
    const fetchMock = stubFetch({ ok: true, body: { matches: [] } })
    const adapter = new FootballDataApiAdapter('test-token')

    await adapter.fetchLiveMatches('WC', '2026-06-14', '2026-06-16')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/competitions/WC/matches')
    expect(url).toContain('status=IN_PLAY,PAUSED,FINISHED')
    expect(url).toContain('dateFrom=2026-06-14')
    expect(url).toContain('dateTo=2026-06-16')
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe('test-token')
  })

  it('fetchMatches queries by season', async () => {
    const fetchMock = stubFetch({ ok: true, body: { matches: [] } })
    const adapter = new FootballDataApiAdapter('test-token')

    await adapter.fetchMatches('BSA', '2026')

    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toContain('/competitions/BSA/matches?season=2026')
  })

  it('returns the matches array on a successful response', async () => {
    stubFetch({ ok: true, body: { matches: [{ id: 1 }, { id: 2 }] } })
    const adapter = new FootballDataApiAdapter('test-token')

    const result = await adapter.fetchLiveMatches('WC', '2026-06-14', '2026-06-16')
    expect(result).toHaveLength(2)
  })

  it('returns [] (and does not throw) when the API responds non-ok, e.g. an invalid token 400', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    stubFetch({ ok: false, status: 400 })
    const adapter = new FootballDataApiAdapter('dummy')

    const result = await adapter.fetchLiveMatches('WC', '2026-06-14', '2026-06-16')
    expect(result).toEqual([])
    expect(console.error).toHaveBeenCalled()
  })

  it('sends the X-Api-Version: v4.1 header so the live minute/injuryTime fields are returned', async () => {
    const fetchMock = stubFetch({ ok: true, body: { matches: [] } })
    const adapter = new FootballDataApiAdapter('test-token')

    await adapter.fetchMatches('WC', '2026')

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-Api-Version']).toBe('v4.1')
  })
})
