import type { Context } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

export const globalRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 100,
  keyGenerator: (c: Context) => c.req.header('x-forwarded-for') ?? 'unknown',
})

export const otpRateLimit = rateLimiter({
  windowMs: 5 * 60_000,
  limit: 3,
  keyGenerator: (c: Context) => {
    const body = c.get('parsedBody') as { phoneNumber?: string } | undefined
    return body?.phoneNumber ?? c.req.header('x-forwarded-for') ?? 'unknown'
  },
  message: { error: 'TOO_MANY_REQUESTS', message: 'Tente novamente em alguns minutos' },
})
