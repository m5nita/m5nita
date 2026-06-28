import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/webpush', () => ({
  isPushConfigured: true,
  webpush: { sendNotification: vi.fn(async () => ({})) },
}))

import type { PushSubscription } from '../../domain/push/PushSubscription'
import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'
import { webpush } from '../../lib/webpush'
import { WebPushNotificationService } from './WebPushNotificationService'

const mockSend = webpush.sendNotification as unknown as ReturnType<typeof vi.fn>

function sub(over: Partial<PushSubscription> = {}): PushSubscription {
  return {
    id: 'id-1',
    userId: 'user-1',
    endpoint: 'https://push.example/abc',
    p256dh: 'p',
    auth: 'a',
    userAgent: null,
    createdAt: new Date(0),
    ...over,
  }
}

function makeRepo(subs: PushSubscription[]) {
  return {
    findByUserId: vi.fn(async () => subs),
    deleteByEndpoints: vi.fn(async () => {}),
    upsert: vi.fn(),
    deleteByEndpoint: vi.fn(),
  } as unknown as PushSubscriptionRepository & {
    findByUserId: ReturnType<typeof vi.fn>
    deleteByEndpoints: ReturnType<typeof vi.fn>
  }
}

const payload = { title: 'T', body: 'B', url: '/pools/x' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WebPushNotificationService.sendToUser', () => {
  it('returns false and sends nothing when the user has no subscriptions', async () => {
    const repo = makeRepo([])
    const svc = new WebPushNotificationService(repo)

    expect(await svc.sendToUser('user-1', payload)).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('delivers to every device and returns true', async () => {
    const repo = makeRepo([sub({ endpoint: 'e1' }), sub({ endpoint: 'e2' })])
    const svc = new WebPushNotificationService(repo)

    expect(await svc.sendToUser('user-1', payload)).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(repo.deleteByEndpoints).not.toHaveBeenCalled()
  })

  it('prunes endpoints reported as 410 Gone / 404', async () => {
    const repo = makeRepo([sub({ endpoint: 'dead' }), sub({ endpoint: 'alive' })])
    mockSend.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint === 'dead') throw { statusCode: 410 }
      return {}
    })
    const svc = new WebPushNotificationService(repo)

    await svc.sendToUser('user-1', payload)

    expect(repo.deleteByEndpoints).toHaveBeenCalledWith(['dead'])
  })

  it('does not prune on a transient (non-404/410) error', async () => {
    const repo = makeRepo([sub({ endpoint: 'e1' })])
    mockSend.mockRejectedValueOnce({ statusCode: 500 })
    const svc = new WebPushNotificationService(repo)

    await svc.sendToUser('user-1', payload)

    expect(repo.deleteByEndpoints).not.toHaveBeenCalled()
  })
})
