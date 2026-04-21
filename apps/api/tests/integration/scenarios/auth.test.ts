import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaGoogle, signInViaMagicLink, signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { resendStub, turnstileStub } from '../support/stubs'
import { VALID_TEST_TOKEN } from '../support/stubs/turnstile-stub'

describe('US1 — authentication flows', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('scenario 1 + 2 — phone OTP creates user + session', async () => {
    const { app, otpInbox } = buildTestApp()

    const phoneNumber = '+5511911110001'
    const user = await signInViaPhoneOtp(app, { phoneNumber })

    expect(user.id).toBeTypeOf('string')
    expect(user.sessionCookie.length).toBeGreaterThan(0)
    expect(otpInbox.get(phoneNumber)).toBeDefined()

    const userRows = await sql`SELECT id, phone_number FROM "user" WHERE id = ${user.id}`
    expect(userRows).toMatchObject([{ phone_number: phoneNumber }])

    const sessionRows = await sql`SELECT id, user_id FROM "session" WHERE user_id = ${user.id}`
    expect(sessionRows.length).toBeGreaterThan(0)

    const meResp = await user.fetch('/api/users/me')
    expect(meResp.status).toBe(200)
    expect(await meResp.json()).toMatchObject({ id: user.id, phoneNumber })
  })

  it('scenario 3 — magic-link email creates user + session', async () => {
    const { app } = buildTestApp()

    const email = 'alice-magic@test.local'
    const user = await signInViaMagicLink(app, { email, displayName: 'Alice' })

    expect(user.id).toBeTypeOf('string')
    expect(user.sessionCookie.length).toBeGreaterThan(0)

    expect(resendStub.emails().length).toBeGreaterThan(0)
    const sent = resendStub.lastEmailFor(email)
    expect(sent).not.toBeNull()

    const userRows = await sql`SELECT id, email FROM "user" WHERE id = ${user.id}`
    expect(userRows).toMatchObject([{ email }])

    const meResp = await user.fetch('/api/users/me')
    expect(meResp.status).toBe(200)
  })

  it('scenario 4 — Google OAuth creates user + account + session', async () => {
    const { app } = buildTestApp()

    const email = 'bob-google@test.local'
    const user = await signInViaGoogle(app, {
      email,
      googleSub: 'test-google-sub-001',
      displayName: 'Bob',
    })

    expect(user.id).toBeTypeOf('string')
    expect(user.sessionCookie.length).toBeGreaterThan(0)

    const userRows = await sql`SELECT id, email FROM "user" WHERE id = ${user.id}`
    expect(userRows).toMatchObject([{ email }])

    const accountRows = await sql`
      SELECT provider_id, account_id FROM "account" WHERE user_id = ${user.id}
    `
    expect(accountRows.length).toBeGreaterThan(0)
    expect(accountRows).toMatchObject([{ provider_id: 'google' }])
  })

  it('scenario 5 — Turnstile rejection blocks sign-in attempts', async () => {
    const { app } = buildTestApp()

    turnstileStub.setMode('always-invalid')

    const response = await app.fetch(
      new Request('http://localhost/api/auth/phone-number/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Turnstile-Token': VALID_TEST_TOKEN,
          origin: 'http://localhost:5173',
          referer: 'http://localhost:5173',
        },
        body: JSON.stringify({ phoneNumber: '+5511911112222' }),
      }),
    )

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)

    const userRows = await sql`SELECT id FROM "user" WHERE phone_number = '+5511911112222'`
    expect(userRows).toHaveLength(0)
  })

  it('scenario 6 — OTP rate limit blocks repeated requests', async () => {
    const { app } = buildTestApp()

    const phoneNumber = '+5511911113333'
    const payload = JSON.stringify({ phoneNumber })
    const headers = {
      'Content-Type': 'application/json',
      'X-Turnstile-Token': VALID_TEST_TOKEN,
      origin: 'http://localhost:5173',
      referer: 'http://localhost:5173',
    } as const

    const statuses: number[] = []
    for (let i = 0; i < 12; i++) {
      const r = await app.fetch(
        new Request('http://localhost/api/auth/phone-number/send-otp', {
          method: 'POST',
          headers,
          body: payload,
        }),
      )
      statuses.push(r.status)
    }

    expect(statuses.some((s) => s === 429)).toBe(true)
  })
})
