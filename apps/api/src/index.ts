// Sentry MUST be the first import so it can instrument http/https before other modules load.
// Side-effect import keeps Biome's import sorter from reordering it.
import './lib/instrument'

import type { ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
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
import { sendPredictionReminders } from './jobs/reminderJob'
import { auth } from './lib/auth'
import { getCaptchaVerifier } from './lib/turnstile'
import { syncFixtures, syncLiveScores } from './services/match'

import type { AppEnv } from './types/hono'

// Validate required environment variables on startup
const requiredEnvVars = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ALLOWED_ORIGIN',
] as const
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
}

const app = new Hono<AppEnv>()

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

app.use('/api/*', secureHeaders())

app.use(
  '/api/*',
  cors({
    origin: [allowedOrigin],
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'X-Turnstile-Token', 'sentry-trace', 'baggage'],
  }),
)

// CSRF — skip webhook/telegram routes (they use their own signature verification)
app.use('/api/*', async (c, next) => {
  const path = c.req.path
  if (path.startsWith('/api/webhooks/') || path.startsWith('/api/telegram/')) {
    return next()
  }
  return csrf({ origin: [allowedOrigin] })(c, next)
})

app.use('/api/*', globalRateLimit)

// OTP rate limit — parse body to extract phone number for per-phone limiting
app.post('/api/auth/phone-number/send-otp', async (c, next) => {
  try {
    const body = await c.req.raw.clone().json()
    c.set('parsedBody', body)
  } catch {
    // Falls back to IP-based rate limiting
  }
  await next()
})
app.post('/api/auth/phone-number/send-otp', otpRateLimit)

// Turnstile tokens are single-use; guard only the initial login entry points.
// verify-otp is already gated by Better Auth's code + attempt limits.
const captchaGuard = turnstileGuard(getCaptchaVerifier())
app.use('/api/auth/phone-number/send-otp', captchaGuard)
app.use('/api/auth/sign-in/magic-link', captchaGuard)
app.use('/api/auth/sign-in/social', captchaGuard)

// Better Auth — mounted directly, no auth middleware
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

// Webhooks — no auth/CSRF middleware (uses MercadoPago/Telegram signatures)
app.route('/api', webhooksRoutes)
app.route('/api', telegramRoutes)

// Protected routes
app.route('/api', usersRoutes)
app.route('/api', competitionsRoutes)
app.route('/api', poolsRoutes)
app.route('/api', matchesRoutes)
app.route('/api', predictionsRoutes)
app.route('/api', rankingRoutes)
app.route('/api', paymentsRoutes)

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message, message: err.cause?.toString() ?? err.message }, err.status)
  }
  Sentry.captureException(err)
  console.error('Unhandled error:', err)
  return c.json({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'NOT_FOUND', message: 'Rota não encontrada' }, 404)
})

const port = Number(process.env.PORT) || 3001

const server: ServerType = serve({ fetch: app.fetch, port }, () => {
  console.log(`m5nita API running on http://localhost:${port}`)

  // Run fixture sync on startup
  syncFixtures().catch((err) => {
    Sentry.captureException(err)
    console.error('[Startup] Fixture sync failed:', err)
  })

  // Sync fixtures every 6 hours
  setInterval(
    () => {
      Sentry.withMonitor(
        'fixture-sync',
        () =>
          syncFixtures().catch((err) => {
            Sentry.captureException(err)
            console.error('[Cron] Fixture sync failed:', err)
            throw err
          }),
        { schedule: { type: 'interval', value: 6, unit: 'hour' } },
      )
    },
    6 * 60 * 60 * 1000,
  )

  // Sync live scores every minute
  setInterval(() => {
    Sentry.withMonitor(
      'live-score-sync',
      () =>
        syncLiveScores().catch((err) => {
          Sentry.captureException(err)
          console.error('[Cron] Live sync failed:', err)
          throw err
        }),
      { schedule: { type: 'interval', value: 1, unit: 'minute' } },
    )
  }, 60 * 1000)

  // Send prediction reminders every 15 minutes
  setInterval(
    () => {
      Sentry.withMonitor(
        'prediction-reminders',
        () =>
          sendPredictionReminders().catch((err) => {
            Sentry.captureException(err)
            console.error('[Cron] Reminder job failed:', err)
            throw err
          }),
        { schedule: { type: 'interval', value: 15, unit: 'minute' } },
      )
    },
    15 * 60 * 1000,
  )
})

// Graceful shutdown — finish in-flight requests before exiting
function gracefulShutdown(signal: string) {
  console.log(`[Shutdown] ${signal} received, closing server...`)
  server.close(() => {
    console.log('[Shutdown] Server closed, exiting.')
    process.exit(0)
  })

  // Force exit after 10 seconds if connections don't close
  setTimeout(() => {
    console.error('[Shutdown] Forcing exit after timeout.')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

export default app
export type AppType = typeof app
