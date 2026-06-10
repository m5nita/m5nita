import type { Context } from 'hono'
import { rateLimiter } from 'hono-rate-limiter'

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
const IPV6 = /^[0-9a-fA-F:]+$/

export function getClientIp(c: Context): string {
  const header = c.req.header('x-forwarded-for')
  if (!header) return 'unknown'
  // Use the LAST hop — the value our own reverse proxy appends — not the first.
  // A client can prepend arbitrary X-Forwarded-For entries and rotate them to
  // dodge a per-IP limit, but cannot control the trailing hop added by the edge.
  const parts = header.split(',')
  const trusted = parts[parts.length - 1]?.trim()
  if (!trusted) return 'unknown'
  if (!IPV4.test(trusted) && !IPV6.test(trusted)) return 'unknown'
  return trusted
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
