import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'

export type UnsubscribeFromPushInput = {
  userId: string
  endpoint: string
}

export class UnsubscribeFromPushUseCase {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  execute(input: UnsubscribeFromPushInput): Promise<void> {
    return this.subscriptions.deleteByEndpoint(input.userId, input.endpoint)
  }
}
