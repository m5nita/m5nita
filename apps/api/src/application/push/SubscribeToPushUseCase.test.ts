import { describe, expect, it, vi } from 'vitest'
import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'
import { SubscribeToPushUseCase } from './SubscribeToPushUseCase'

function makeRepo() {
  return {
    upsert: vi.fn(async () => {}),
    findByUserId: vi.fn(),
    deleteByEndpoint: vi.fn(),
    deleteByEndpoints: vi.fn(),
  } as unknown as PushSubscriptionRepository & { upsert: ReturnType<typeof vi.fn> }
}

describe('SubscribeToPushUseCase', () => {
  it('upserts the subscription for the given user', async () => {
    const repo = makeRepo()
    const useCase = new SubscribeToPushUseCase(repo)

    await useCase.execute({
      userId: 'user-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      auth: 'a',
      userAgent: 'Mozilla',
    })

    expect(repo.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      endpoint: 'https://push.example/abc',
      p256dh: 'p',
      auth: 'a',
      userAgent: 'Mozilla',
    })
  })
})
