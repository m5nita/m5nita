// Sentry MUST be the first import so it can instrument http/https before other modules load.
// Side-effect import keeps Biome's import sorter from reordering it.
import './lib/instrument'

import type { ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'
import { buildApp } from './app'
import { sendPredictionReminders } from './jobs/reminderJob'
import { syncFixtures, syncLiveScores } from './services/match'

// Validate required environment variables on startup
const requiredEnvVars = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ALLOWED_ORIGIN',
  'PIX_ENCRYPTION_KEY',
] as const
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
}

const app = buildApp()

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
