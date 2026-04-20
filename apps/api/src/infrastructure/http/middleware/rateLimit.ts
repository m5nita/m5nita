import type { Context } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]+$/

export function getClientIp(c: Context): string {
  const header = c.req.header('x-forwarded-for')
  if (!header) return 'unknown'
  const first = header.split(',')[0]?.trim()
  if (!first) return 'unknown'
  if (!IPV4.test(first) && !IPV6.test(first)) return 'unknown'
  return first
}

export const globalRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 100,
  keyGenerator: getClientIp,
})

export const otpRateLimit = rateLimiter({
  windowMs: 5 * 60_000,
  limit: 3,
  keyGenerator: (c: Context) => {
    const body = c.get('parsedBody') as { phoneNumber?: string } | undefined
    return body?.phoneNumber ?? getClientIp(c)
  },
  message: { error: 'TOO_MANY_REQUESTS', message: 'Tente novamente em alguns minutos' },
})
