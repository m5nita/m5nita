import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'

/**
 * Web Push — subscribe/unsubscribe HTTP routes end-to-end against real Postgres.
 * Exercises POST/DELETE /api/push/subscribe → use cases → DrizzlePushSubscription
 * repo → push_subscription table (auth, idempotent upsert, multi-device, delete).
 */
const ORIGIN = () => process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

function subscriptionBody(endpoint: string) {
  return { endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } }
}

describe('Web Push — subscribe routes', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function countSubs(userId: string): Promise<number> {
    const rows = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM push_subscription WHERE user_id = ${userId}
    `
    return rows[0]?.n ?? 0
  }

  it('rejects an unauthenticated subscribe with 401', async () => {
    const { app } = buildTestApp()
    const resp = await app.fetch(
      new Request('http://localhost/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN(), referer: ORIGIN() },
        body: JSON.stringify(subscriptionBody('https://push.example/anon')),
      }),
    )
    expect(resp.status).toBe(401)
  })

  it('stores a subscription (201) and is idempotent by endpoint', async () => {
    const { app } = buildTestApp()
    const user = await signInViaPhoneOtp(app, { phoneNumber: '+5511900000001' })

    const first = await user.fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscriptionBody('https://push.example/a')),
    })
    expect(first.status).toBe(201)
    expect(await countSubs(user.id)).toBe(1)

    const second = await user.fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscriptionBody('https://push.example/a')),
    })
    expect(second.status).toBe(201)
    expect(await countSubs(user.id)).toBe(1)
  })

  it('supports multiple devices and unsubscribe removes only the targeted one', async () => {
    const { app } = buildTestApp()
    const user = await signInViaPhoneOtp(app, { phoneNumber: '+5511900000002' })

    for (const endpoint of ['https://push.example/d1', 'https://push.example/d2']) {
      const r = await user.fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscriptionBody(endpoint)),
      })
      expect(r.status).toBe(201)
    }
    expect(await countSubs(user.id)).toBe(2)

    const del = await user.fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example/d1' }),
    })
    expect(del.status).toBe(200)
    expect(await countSubs(user.id)).toBe(1)

    const remaining = await sql<{ endpoint: string }[]>`
      SELECT endpoint FROM push_subscription WHERE user_id = ${user.id}
    `
    expect(remaining[0]?.endpoint).toBe('https://push.example/d2')
  })

  it('rejects an invalid subscribe body with 400', async () => {
    const { app } = buildTestApp()
    const user = await signInViaPhoneOtp(app, { phoneNumber: '+5511900000003' })

    const resp = await user.fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: 'not-a-url' }),
    })
    expect(resp.status).toBe(400)
    expect(await countSubs(user.id)).toBe(0)
  })
})
