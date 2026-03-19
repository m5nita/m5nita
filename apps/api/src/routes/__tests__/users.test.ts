import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usersRoutes } from '../users'

// Mock auth middleware to inject test user
vi.mock('../../middleware/auth', () => ({
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

// Mock database
vi.mock('../../db/client', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [
            { id: 'user-1', name: 'Updated Name', phoneNumber: '+5511999999999' },
          ]),
        })),
      })),
    })),
  },
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

describe('PATCH /api/users/me', () => {
  let app: Hono

  beforeEach(() => {
    app = createTestApp()
  })

  it('updates_validName_updatedProfile', async () => {
    const res = await app.request('/api/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ name: 'Updated Name' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Updated Name')
    expect(body.phoneNumber).toBe('+5511999999999')
  })

  it('rejects_emptyName_400validation', async () => {
    const res = await app.request('/api/users/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-test-user': JSON.stringify(testUser),
      },
      body: JSON.stringify({ name: '' }),
    })

    expect(res.status).toBe(400)
  })

  it('rejects_noAuth_401unauthorized', async () => {
    const res = await app.request('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    })

    expect(res.status).toBe(401)
  })
})
