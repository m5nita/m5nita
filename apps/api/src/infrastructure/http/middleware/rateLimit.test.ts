import type { Context } from 'hono'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppEnv } from '../../../types/hono'
import { getClientIp, otpRateLimit } from './rateLimit'

function ipCtx(xff?: string): Context {
  return {
    req: { header: (name: string) => (name === 'x-forwarded-for' ? xff : undefined) },
  } as unknown as Context
}

describe('getClientIp', () => {
  it('returns the IP when a single value is present', () => {
    expect(getClientIp(ipCtx('203.0.113.7'))).toBe('203.0.113.7')
  })

  it('uses the trusted last hop, ignoring a client-spoofed first value', () => {
    // Our reverse proxy appends the real connecting IP last; a client can
    // prepend a fake IP but cannot control the trailing hop.
    expect(getClientIp(ipCtx('1.1.1.1, 203.0.113.7'))).toBe('203.0.113.7')
  })

  it('keeps the same key when only the spoofed first value rotates', () => {
    expect(getClientIp(ipCtx('9.9.9.9, 203.0.113.7'))).toBe(
      getClientIp(ipCtx('8.8.8.8, 203.0.113.7')),
    )
  })

  it('returns "unknown" when the header is absent', () => {
    expect(getClientIp(ipCtx(undefined))).toBe('unknown')
  })

  it('returns "unknown" when the trusted value is not a valid IP', () => {
    expect(getClientIp(ipCtx('203.0.113.7, garbage'))).toBe('unknown')
  })
})

function createTestApp() {
  const app = new Hono<AppEnv>()

  // Body parser middleware (same as index.ts)
  app.post('/api/auth/phone-number/send-otp', async (c, next) => {
    try {
      const body = await c.req.raw.clone().json()
      c.set('parsedBody', body)
    } catch {
      // Falls back to IP-based rate limiting
    }
    await next()
  })

  // OTP rate limit
  app.post('/api/auth/phone-number/send-otp', otpRateLimit)

  // Mock auth handler
  app.post('/api/auth/phone-number/send-otp', (c) => {
    return c.json({ status: 'otp_sent' })
  })

  return app
}

describe('otpRateLimit', () => {
  let app: Hono<AppEnv>

  beforeEach(() => {
    app = createTestApp()
  })

  it('allows_firstThreeRequests_samePhonenumber', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/auth/phone-number/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '+5511999990001' }),
      })
      expect(res.status).toBe(200)
    }
  })

  it('blocks_fourthRequest_samePhonenumber', async () => {
    const phone = '+5511999990002'
    for (let i = 0; i < 3; i++) {
      await app.request('/api/auth/phone-number/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
    }

    const res = await app.request('/api/auth/phone-number/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone }),
    })

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe('TOO_MANY_REQUESTS')
  })

  it('allows_differentPhoneNumbers_independentLimits', async () => {
    for (let i = 0; i < 3; i++) {
      await app.request('/api/auth/phone-number/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '+5511999990003' }),
      })
    }

    // Different phone should still work
    const res = await app.request('/api/auth/phone-number/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '+5511999990004' }),
    })

    expect(res.status).toBe(200)
  })
})
