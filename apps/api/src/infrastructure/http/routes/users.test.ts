import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usersRoutes } from './users'

// Mock auth middleware to inject test user
vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const testUser = c.req.header('x-test-user')
    if (testUser) {
      const user = JSON.parse(testUser)
      c.set('user', user)
      c.set('session', { id: 'test-session' })
      return next()
    }
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }),
}))

const { setSpy, findFirstSpy } = vi.hoisted(() => ({
  setSpy: vi.fn(),
  findFirstSpy: vi.fn(async () => null as unknown),
}))

// Mock database
vi.mock('../../../db/client', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn((payload: unknown) => {
        setSpy(payload)
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => [
              { id: 'user-1', name: 'Updated Name', phoneNumber: '+5511999999999' },
            ]),
          })),
        }
      }),
    })),
    query: {
      user: {
        findFirst: findFirstSpy,
      },
    },
  },
}))

vi.mock('../../../container', () => ({
  getContainer: vi.fn(() => ({
    getPendingPrizesUseCase: {
      execute: vi.fn(async () => ({
        items: [{ poolId: 'pool-a', poolName: 'Bolão A', winnerShare: 10000, winnerCount: 1 }],
      })),
    },
  })),
}))

function createTestApp() {
  const app = new Hono()
  app.route('/api', usersRoutes)
  return app
}

const testUser = {
  id: 'user-1',
  name: 'Test User',
  phoneNumber: '+5511999999999',
}

describe('GET /api/users/me', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
  })

  it('returns_authenticatedUser_userProfile', async () => {
    const res = await app.request('/api/users/me', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      id: 'user-1',
      name: 'Test User',
      phoneNumber: '+5511999999999',
    })
  })

  it('returns_noAuth_401unauthorized', async () => {
    const res = await app.request('/api/users/me')

    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/users/me/phone', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
    setSpy.mockClear()
    findFirstSpy.mockReset()
    findFirstSpy.mockResolvedValue(null)
  })

  it('does NOT mark the new phone as verified (no OTP was performed)', async () => {
    const res = await app.request('/api/users/me/phone', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ phoneNumber: '+5511988888888' }),
    })

    expect(res.status).toBe(200)
    expect(setSpy).toHaveBeenCalledTimes(1)
    const payload = setSpy.mock.calls[0]?.[0] as { phoneNumberVerified?: boolean }
    expect(payload.phoneNumberVerified).toBe(false)
  })

  it('rejects a number already linked to another account (409)', async () => {
    findFirstSpy.mockResolvedValue({ id: 'someone-else', phoneNumber: '+5511988888888' })

    const res = await app.request('/api/users/me/phone', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ phoneNumber: '+5511988888888' }),
    })

    expect(res.status).toBe(409)
    expect(setSpy).not.toHaveBeenCalled()
  })

  it('rejects an invalid phone number (400)', async () => {
    const res = await app.request('/api/users/me/phone', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ phoneNumber: 'not-a-phone' }),
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/users/me/pending-prizes', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
  })

  it('returns_authenticatedUser_listOfPendingPrizes', async () => {
    const res = await app.request('/api/users/me/pending-prizes', {
      headers: { 'x-test-user': JSON.stringify(testUser) },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      items: [{ poolId: 'pool-a', poolName: 'Bolão A', winnerShare: 10000, winnerCount: 1 }],
    })
  })

  it('rejects_noAuth_401unauthorized', async () => {
    const res = await app.request('/api/users/me/pending-prizes')
    expect(res.status).toBe(401)
  })
})
