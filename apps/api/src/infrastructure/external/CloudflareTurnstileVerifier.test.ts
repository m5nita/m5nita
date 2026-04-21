import { describe, expect, it, vi } from 'vitest'
import { TurnstileToken } from '../../domain/shared/TurnstileToken'
import { CloudflareTurnstileVerifier } from './CloudflareTurnstileVerifier'

function makeVerifier(fetchFn: typeof fetch) {
  return new CloudflareTurnstileVerifier('secret', { fetchFn, timeoutMs: 100 })
}

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('CloudflareTurnstileVerifier', () => {
  it('verify_success_returnsOk', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const verifier = makeVerifier(fetchFn as unknown as typeof fetch)
    const result = await verifier.verify(TurnstileToken.fromHeader('tok'), '1.2.3.4')
    expect(result).toEqual({ ok: true })
    const call = fetchFn.mock.calls[0]
    expect(call?.[0]).toContain('siteverify')
    expect((call?.[1]?.body as URLSearchParams).get('remoteip')).toBe('1.2.3.4')
  })

  it('verify_invalid_returnsInvalid', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] }),
      )
    const verifier = makeVerifier(fetchFn as unknown as typeof fetch)
    const result = await verifier.verify(TurnstileToken.fromHeader('tok'), null)
    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('verify_timeoutOrDuplicate_returnsExpired', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ success: false, 'error-codes': ['timeout-or-duplicate'] }))
    const verifier = makeVerifier(fetchFn as unknown as typeof fetch)
    const result = await verifier.verify(TurnstileToken.fromHeader('tok'), null)
    expect(result).toEqual({ ok: false, reason: 'expired' })
  })

  it('verify_networkError_returnsUnavailable', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'))
    const verifier = makeVerifier(fetchFn as unknown as typeof fetch)
    const result = await verifier.verify(TurnstileToken.fromHeader('tok'), null)
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('verify_non2xx_returnsUnavailable', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({}, false))
    const verifier = makeVerifier(fetchFn as unknown as typeof fetch)
    const result = await verifier.verify(TurnstileToken.fromHeader('tok'), null)
    expect(result).toEqual({ ok: false, reason: 'unavailable' })
  })
})
