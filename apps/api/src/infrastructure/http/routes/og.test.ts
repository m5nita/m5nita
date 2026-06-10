import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFindByIdWithDetails = vi.fn()
const mockGetPoolByInviteCode = vi.fn()
const mockRender = vi.fn(async (..._args: unknown[]) => Buffer.from('fake-png-bytes'))

vi.mock('../../../container', () => ({
  getContainer: () => ({ poolRepo: { findByIdWithDetails: mockFindByIdWithDetails } }),
}))
vi.mock('../../../services/pool', () => ({
  getPoolByInviteCode: (...args: unknown[]) => mockGetPoolByInviteCode(...args),
}))
vi.mock('../../../lib/ogImage', () => ({
  renderPoolOgPng: (...args: unknown[]) => mockRender(...args),
}))
vi.mock('../../../db/client', () => ({ db: {} }))

const { ogRoutes } = await import('./og')

function createTestApp() {
  const app = new Hono()
  app.route('/', ogRoutes)
  return app
}

function poolDetailsFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pool-1',
    name: 'Bolão da Firma',
    entryFee: 5000,
    ownerId: 'owner-1',
    inviteCode: 'ABCD1234',
    competitionId: 'comp-1',
    matchdayFrom: 1,
    matchdayTo: 38,
    matchId: null,
    status: 'active',
    isOpen: true,
    couponId: null,
    owner: { id: 'owner-1', name: 'João' },
    competitionName: 'Brasileirão',
    coupon: null,
    memberCount: 4,
    prizeTotal: 19000,
    hasLiveMatch: false,
    ...overrides,
  }
}

describe('OG pool routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses the repository discount-aware prize, not a hardcoded 0.95 factor', async () => {
    // entryFee 5000 x 4 members x 0.95 = 19000 (R$190,00) would be the old buggy
    // value. With a coupon the repo returns a different prize; the card must show
    // that, not re-derive 0.95.
    mockFindByIdWithDetails.mockResolvedValueOnce(poolDetailsFixture({ prizeTotal: 18000 }))

    const res = await createTestApp().request('/og/pool/pool-1')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('180,00')
    expect(html).not.toContain('190,00')
  })

  it('caches the rendered PNG so repeated crawler fetches render only once', async () => {
    mockFindByIdWithDetails.mockResolvedValue(poolDetailsFixture({ id: 'pool-cache' }))
    const app = createTestApp()

    const r1 = await app.request('/og/pool/pool-cache/image.png')
    const r2 = await app.request('/og/pool/pool-cache/image.png')

    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
  })

  it('re-renders when the member count changes (cache key includes it)', async () => {
    mockFindByIdWithDetails.mockResolvedValueOnce(
      poolDetailsFixture({ id: 'pool-grow', memberCount: 2 }),
    )
    mockFindByIdWithDetails.mockResolvedValueOnce(
      poolDetailsFixture({ id: 'pool-grow', memberCount: 3 }),
    )
    const app = createTestApp()

    await app.request('/og/pool/pool-grow/image.png')
    await app.request('/og/pool/pool-grow/image.png')

    expect(mockRender).toHaveBeenCalledTimes(2)
  })
})
