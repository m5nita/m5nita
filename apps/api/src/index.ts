// Sentry MUST be the first import so it can instrument http/https before other modules load.
// Side-effect import keeps Biome's import sorter from reordering it.
import './lib/instrument'

import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { globalRateLimit, otpRateLimit } from './infrastructure/http/middleware/rateLimit'
import { competitionsRoutes } from './infrastructure/http/routes/competitions'
import { matchesRoutes } from './infrastructure/http/routes/matches'
import { poolsRoutes } from './infrastructure/http/routes/pools'
import { predictionsRoutes } from './infrastructure/http/routes/predictions'
import { rankingRoutes } from './infrastructure/http/routes/ranking'
import { telegramRoutes } from './infrastructure/http/routes/telegram'
import { usersRoutes } from './infrastructure/http/routes/users'
import { webhooksRoutes } from './infrastructure/http/routes/webhooks'
import { sendPredictionReminders } from './jobs/reminderJob'
import { auth } from './lib/auth'
import { syncFixtures, syncLiveScores } from './services/match'

import type { AppEnv } from './types/hono'

const app = new Hono<AppEnv>()

const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

app.use(
  '/api/*',
  cors({
    origin: [allowedOrigin],
    credentials: true,
  }),
)

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

// Better Auth — mounted directly, no auth middleware
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

// Webhooks — no auth middleware (uses MercadoPago/Telegram signatures)
app.route('/api', webhooksRoutes)
app.route('/api', telegramRoutes)

// Protected routes
app.route('/api', usersRoutes)
app.route('/api', competitionsRoutes)
app.route('/api', poolsRoutes)
app.route('/api', matchesRoutes)
app.route('/api', predictionsRoutes)
app.route('/api', rankingRoutes)

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

serve({ fetch: app.fetch, port }, () => {
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

export default app
export type AppType = typeof app
