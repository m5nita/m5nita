import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { linkTelegramChat } from '../support/fixtures/linkTelegramChat'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'
import { telegramStub } from '../support/stubs'

/**
 * "Novo bolão" announcement, end to end through the real payment webhook.
 *
 * Push is unconfigured in tests (no VAPID keys), so every recipient falls
 * through to Telegram — which is exactly the channel the stub can observe.
 */
describe('New-pool broadcast', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  function newPoolSends(chatId: number) {
    return telegramStub.sends().filter((s) => s.chatId === chatId && s.text.includes('Novo bolão'))
  }

  it('notifies another user once the entry payment is confirmed, and never the creator', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const ownerPhone = '+5511911110001'
    const recipientPhone = '+5511911110002'
    const owner = await signInViaPhoneOtp(app, { phoneNumber: ownerPhone })
    await signInViaPhoneOtp(app, { phoneNumber: recipientPhone })
    const ownerChat = await linkTelegramChat(sql, ownerPhone)
    const recipientChat = await linkTelegramChat(sql, recipientPhone)

    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      name: 'Bolão avisado',
      entryFeeCentavos: 10_000,
      notifyEveryone: true,
    })

    // Nothing is announced while the pool is still awaiting payment.
    expect(newPoolSends(recipientChat)).toHaveLength(0)

    expect((await deliverInfinitePayPaidWebhook(app, pool.paymentId)).status).toBe(200)

    const delivered = newPoolSends(recipientChat)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]?.text).toContain('Bolão avisado')
    // Entry fee, so the recipient can decide without opening the app. The invite
    // link is only rendered when APP_URL is configured, which tests do not set.
    expect(delivered[0]?.text).toContain('100,00')
    expect(newPoolSends(ownerChat)).toHaveLength(0)
  })

  it('announces only once when the same payment confirmation arrives twice', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const ownerPhone = '+5511911110011'
    const recipientPhone = '+5511911110012'
    const owner = await signInViaPhoneOtp(app, { phoneNumber: ownerPhone })
    await signInViaPhoneOtp(app, { phoneNumber: recipientPhone })
    const recipientChat = await linkTelegramChat(sql, recipientPhone)

    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      name: 'Bolão duplicado',
      notifyEveryone: true,
    })

    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    expect(newPoolSends(recipientChat)).toHaveLength(1)
  })

  it('stays silent when the creator did not opt in', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const ownerPhone = '+5511911110021'
    const recipientPhone = '+5511911110022'
    const owner = await signInViaPhoneOtp(app, { phoneNumber: ownerPhone })
    await signInViaPhoneOtp(app, { phoneNumber: recipientPhone })
    const recipientChat = await linkTelegramChat(sql, recipientPhone)

    const pool = await makePool({ admin: owner, competitionId: comp.id, name: 'Bolão quieto' })

    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    expect(newPoolSends(recipientChat)).toHaveLength(0)
    const rows = await sql<
      { notify_on_create: boolean }[]
    >`SELECT notify_on_create FROM "pool" WHERE id = ${pool.id}`
    expect(rows[0]?.notify_on_create).toBe(false)
  })

  it('skips a recipient who turned new-pool notices off', async () => {
    const { app } = buildTestApp()
    const comp = await makeCompetition(sql)

    const ownerPhone = '+5511911110031'
    const optedOutPhone = '+5511911110032'
    const owner = await signInViaPhoneOtp(app, { phoneNumber: ownerPhone })
    const optedOut = await signInViaPhoneOtp(app, { phoneNumber: optedOutPhone })
    const optedOutChat = await linkTelegramChat(sql, optedOutPhone)

    const patch = await optedOut.fetch('/api/notification-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'new_pool', enabled: false }),
    })
    expect(patch.status).toBe(200)

    const pool = await makePool({
      admin: owner,
      competitionId: comp.id,
      name: 'Bolão ignorado',
      notifyEveryone: true,
    })

    await deliverInfinitePayPaidWebhook(app, pool.paymentId)

    expect(newPoolSends(optedOutChat)).toHaveLength(0)
  })
})
