import { describe, expect, it, vi } from 'vitest'
import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'
import { UnsubscribeFromPushUseCase } from './UnsubscribeFromPushUseCase'

function makeRepo() {
  return {
    upsert: vi.fn(),
    findByUserId: vi.fn(),
    deleteByEndpoint: vi.fn(async () => {}),
    deleteByEndpoints: vi.fn(),
  } as unknown as PushSubscriptionRepository & { deleteByEndpoint: ReturnType<typeof vi.fn> }
}

describe('UnsubscribeFromPushUseCase', () => {
  it('deletes the subscription by user and endpoint', async () => {
    const repo = makeRepo()
    const useCase = new UnsubscribeFromPushUseCase(repo)

    await useCase.execute({ userId: 'user-1', endpoint: 'https://push.example/abc' })

    expect(repo.deleteByEndpoint).toHaveBeenCalledWith('user-1', 'https://push.example/abc')
  })
})
