import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type {
  CaptchaResult,
  CaptchaVerifier,
} from '../../../application/ports/CaptchaVerifier.port'
import { turnstileGuard } from './turnstileGuard'

function fakeVerifier(result: CaptchaResult): CaptchaVerifier {
  return { verify: async () => result }
}

function buildApp(verifier: CaptchaVerifier) {
  const app = new Hono()
  app.use('/protected', turnstileGuard(verifier))
  app.post('/protected', (c) => c.json({ ok: true }))
  return app
}

describe('turnstileGuard', () => {
  it('missingHeader_returns400CaptchaRequired', async () => {
    const app = buildApp(fakeVerifier({ ok: true }))
    const res = await app.request('/protected', { method: 'POST' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'captcha_required' })
  })

  it('invalidToken_returns403CaptchaFailed', async () => {
    const app = buildApp(fakeVerifier({ ok: false, reason: 'invalid' }))
    const res = await app.request('/protected', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'abc' },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'captcha_failed' })
  })

  it('expiredToken_returns403CaptchaExpired', async () => {
    const app = buildApp(fakeVerifier({ ok: false, reason: 'expired' }))
    const res = await app.request('/protected', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'abc' },
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'captcha_expired' })
  })

  it('unavailable_returns503', async () => {
    const app = buildApp(fakeVerifier({ ok: false, reason: 'unavailable' }))
    const res = await app.request('/protected', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'abc' },
    })
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'captcha_unavailable' })
  })

  it('valid_passesThrough', async () => {
    const app = buildApp(fakeVerifier({ ok: true }))
    const res = await app.request('/protected', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'abc' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('oversizedToken_returns400CaptchaInvalid', async () => {
    const app = buildApp(fakeVerifier({ ok: true }))
    const res = await app.request('/protected', {
      method: 'POST',
      headers: { 'x-turnstile-token': 'x'.repeat(2049) },
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'captcha_invalid' })
  })
})
