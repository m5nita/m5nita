import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationError } from '../../../domain/notification/NotificationError'
import type { AppEnv } from '../../../types/hono'

vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    const testUser = c.req.header('x-test-user')
    if (testUser) {
      c.set('user', JSON.parse(testUser))
      c.set('session', { id: 'test-session' })
      return next()
    }
    return c.json({ error: 'UNAUTHORIZED' }, 401)
  }),
}))

const mockGetExecute = vi.fn()
const mockUpdateExecute = vi.fn()

vi.mock('../../../container', () => ({
  getContainer: () => ({
    getNotificationPreferencesUseCase: {
      execute: (...args: unknown[]) => mockGetExecute(...args),
    },
    updateNotificationPreferencesUseCase: {
      execute: (...args: unknown[]) => mockUpdateExecute(...args),
    },
  }),
}))

import { notificationPreferencesRoutes } from './notificationPreferences'

const testUser = { id: 'user-1', name: 'Ana' }
const authHeaders = {
  'Content-Type': 'application/json',
  'x-test-user': JSON.stringify(testUser),
}

const LIST = {
  types: [
    {
      code: 'new_pool',
      label: 'Novos bolões',
      description: 'Avisos de bolão novo.',
      enabled: true,
      optOutable: true,
    },
    {
      code: 'pool_result',
      label: 'Prêmio disponível',
      description: 'Aviso de prêmio para saque.',
      enabled: true,
      optOutable: false,
    },
  ],
}

const app = new Hono<AppEnv>()
app.route('/api', notificationPreferencesRoutes)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/notification-preferences', () => {
  it('returns_authenticated_theResolvedCatalog', async () => {
    mockGetExecute.mockResolvedValue(LIST)

    const res = await app.request('/api/notification-preferences', { headers: authHeaders })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(LIST)
    expect(mockGetExecute).toHaveBeenCalledWith({ userId: 'user-1' })
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/notification-preferences')

    expect(res.status).toBe(401)
    expect(mockGetExecute).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/notification-preferences', () => {
  it('updates_validBody_returnsRefreshedList', async () => {
    mockUpdateExecute.mockResolvedValue(LIST)

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ code: 'new_pool', enabled: false }),
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(LIST)
    expect(mockUpdateExecute).toHaveBeenCalledWith({
      userId: 'user-1',
      code: 'new_pool',
      enabled: false,
    })
  })

  it('rejects_malformedBody_400validation', async () => {
    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ code: 'new_pool' }),
    })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('VALIDATION_ERROR')
    expect(mockUpdateExecute).not.toHaveBeenCalled()
  })

  it('rejects_nonJsonBody_400validation', async () => {
    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders,
      body: 'not json',
    })

    expect(res.status).toBe(400)
    expect(mockUpdateExecute).not.toHaveBeenCalled()
  })

  it('maps_unknownType_404', async () => {
    mockUpdateExecute.mockRejectedValue(new NotificationError('UNKNOWN_TYPE', 'desconhecido'))

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ code: 'nope', enabled: false }),
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('UNKNOWN_TYPE')
  })

  it('maps_lockedType_409', async () => {
    mockUpdateExecute.mockRejectedValue(new NotificationError('TYPE_LOCKED', 'não pode desativar'))

    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ code: 'pool_result', enabled: false }),
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('TYPE_LOCKED')
  })

  it('rejects_noAuth_401', async () => {
    const res = await app.request('/api/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'new_pool', enabled: false }),
    })

    expect(res.status).toBe(401)
    expect(mockUpdateExecute).not.toHaveBeenCalled()
  })
})
