import type { Context, MiddlewareHandler } from 'hono'
import type { CaptchaVerifier } from '../../../application/ports/CaptchaVerifier.port'
import {
  InvalidCaptchaTokenError,
  MissingCaptchaTokenError,
  TurnstileToken,
} from '../../../domain/shared/TurnstileToken'

type ErrorCode =
  | 'captcha_required'
  | 'captcha_invalid'
  | 'captcha_failed'
  | 'captcha_expired'
  | 'captcha_unavailable'

export function turnstileGuard(verifier: CaptchaVerifier): MiddlewareHandler {
  return async (c, next) => {
    let token: TurnstileToken
    try {
      token = TurnstileToken.fromHeader(c.req.header('x-turnstile-token'))
    } catch (err) {
      if (err instanceof MissingCaptchaTokenError) return fail(c, 400, 'captcha_required')
      if (err instanceof InvalidCaptchaTokenError) return fail(c, 400, 'captcha_invalid')
      throw err
    }

    const result = await verifier.verify(token, extractRemoteIp(c))
    if (result.ok) return next()
    if (result.reason === 'unavailable') return fail(c, 503, 'captcha_unavailable')
    if (result.reason === 'expired' || result.reason === 'duplicate') {
      return fail(c, 403, 'captcha_expired')
    }
    return fail(c, 403, 'captcha_failed')
  }
}

function fail(c: Context, status: 400 | 403 | 503, code: ErrorCode) {
  return c.json({ error: code }, status)
}

function extractRemoteIp(c: Context): string | null {
  const cf = c.req.header('cf-connecting-ip')
  if (cf) return cf
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0]?.trim() ?? null
  return null
}
