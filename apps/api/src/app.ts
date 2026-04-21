import { phoneSchema } from '@m5nita/shared'
import * as Sentry from '@sentry/node'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { globalRateLimit, otpRateLimit } from './infrastructure/http/middleware/rateLimit'
import { turnstileGuard } from './infrastructure/http/middleware/turnstileGuard'
import { competitionsRoutes } from './infrastructure/http/routes/competitions'
import { matchesRoutes } from './infrastructure/http/routes/matches'
import { paymentsRoutes } from './infrastructure/http/routes/payments'
import { poolsRoutes } from './infrastructure/http/routes/pools'
import { predictionsRoutes } from './infrastructure/http/routes/predictions'
import { rankingRoutes } from './infrastructure/http/routes/ranking'
import { telegramRoutes } from './infrastructure/http/routes/telegram'
import { usersRoutes } from './infrastructure/http/routes/users'
import { webhooksRoutes } from './infrastructure/http/routes/webhooks'
import { auth } from './lib/auth'
import { getCaptchaVerifier } from './lib/turnstile'
import type { AppEnv } from './types/hono'

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

  app.use('/api/*', secureHeaders())

  app.use(
    '/api/*',
    cors({
      origin: [allowedOrigin],
      credentials: true,
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'X-Turnstile-Token',
        'sentry-trace',
        'baggage',
      ],
    }),
  )

  app.use('/api/*', async (c, next) => {
    const path = c.req.path
    if (path.startsWith('/api/webhooks/') || path.startsWith('/api/telegram/')) {
      return next()
    }
    return csrf({ origin: [allowedOrigin] })(c, next)
  })

  app.use('/api/*', globalRateLimit)

  app.post('/api/auth/phone-number/send-otp', async (c, next) => {
    let body: unknown
    try {
      body = await c.req.raw.clone().json()
    } catch {
      return c.json({ error: 'INVALID_BODY', message: 'Corpo inválido' }, 400)
    }
    const parsed = phoneSchema.safeParse((body as { phoneNumber?: unknown })?.phoneNumber)
    if (!parsed.success) {
      return c.json({ error: 'INVALID_PHONE', message: 'Telefone inválido' }, 400)
    }
    c.set('parsedBody', { phoneNumber: parsed.data })
    await next()
  })
  app.post('/api/auth/phone-number/send-otp', otpRateLimit)

  const captchaGuard = turnstileGuard(getCaptchaVerifier())
  app.use('/api/auth/phone-number/send-otp', captchaGuard)
  app.use('/api/auth/sign-in/magic-link', captchaGuard)
  app.use('/api/auth/sign-in/social', captchaGuard)

  app.get('/api/health', (c) => c.json({ status: 'ok' }))

  app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

  app.route('/api', webhooksRoutes)
  app.route('/api', telegramRoutes)

  app.route('/api', usersRoutes)
  app.route('/api', competitionsRoutes)
  app.route('/api', poolsRoutes)
  app.route('/api', matchesRoutes)
  app.route('/api', predictionsRoutes)
  app.route('/api', rankingRoutes)
  app.route('/api', paymentsRoutes)

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { error: err.message, message: err.cause?.toString() ?? err.message },
        err.status,
      )
    }
    Sentry.captureException(err)
    console.error('Unhandled error:', err)
    return c.json({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' }, 500)
  })

  app.notFound((c) => {
    return c.json({ error: 'NOT_FOUND', message: 'Rota não encontrada' }, 404)
  })

  return app
}
