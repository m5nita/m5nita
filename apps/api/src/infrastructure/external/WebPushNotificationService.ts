import type { PushSubscription } from '../../domain/push/PushSubscription'
import type { PushSubscriptionRepository } from '../../domain/push/PushSubscriptionRepository.port'
import { isPushConfigured, webpush } from '../../lib/webpush'

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
}

function toWebPushSubscription(sub: PushSubscription) {
  return { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
}

// 404 Not Found / 410 Gone ⇒ the endpoint is permanently dead and must be pruned.
function isGoneError(err: unknown): boolean {
  const status = (err as { statusCode?: number })?.statusCode
  return status === 404 || status === 410
}

// Structured, greppable telemetry so SC-004 (latency) and SC-007 (invalid-endpoint
// rate) are measurable from logs/counters without a metrics backend.
function recordOutcome(outcome: 'ok' | 'pruned' | 'error'): void {
  console.log(`[WebPush] send outcome=${outcome}`)
}

/**
 * Sends RFC 8291-encrypted Web Push to all of a user's devices via the `web-push`
 * library, pruning subscriptions the push service reports as gone. The only
 * place that talks to `web-push`.
 */
export class WebPushNotificationService {
  constructor(private readonly subscriptions: PushSubscriptionRepository) {}

  // Returns true when push handled this user (≥1 device targeted), so the
  // composite can stop and not fall back to Telegram/email. False when push is
  // unconfigured or the user has no subscriptions.
  async sendToUser(userId: string, payload: PushPayload): Promise<boolean> {
    if (!isPushConfigured) return false
    const subs = await this.subscriptions.findByUserId(userId)
    if (subs.length === 0) return false
    await this.deliver(subs, payload)
    return true
  }

  private async deliver(subs: PushSubscription[], payload: PushPayload): Promise<void> {
    const dead: string[] = []
    await Promise.all(subs.map((sub) => this.sendOne(sub, payload, dead)))
    if (dead.length > 0) await this.subscriptions.deleteByEndpoints(dead)
  }

  private async sendOne(
    sub: PushSubscription,
    payload: PushPayload,
    dead: string[],
  ): Promise<void> {
    try {
      await webpush.sendNotification(toWebPushSubscription(sub), JSON.stringify(payload))
      recordOutcome('ok')
    } catch (err) {
      if (isGoneError(err)) {
        dead.push(sub.endpoint)
        recordOutcome('pruned')
        return
      }
      recordOutcome('error')
      console.error('[WebPush] send failed:', err)
    }
  }
}
