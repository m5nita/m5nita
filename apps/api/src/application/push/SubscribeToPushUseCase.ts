import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'

export type SubscribeToPushInput = {
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
}

export class SubscribeToPushUseCase {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  execute(input: SubscribeToPushInput): Promise<void> {
    return this.subscriptions.upsert(input)
  }
}
