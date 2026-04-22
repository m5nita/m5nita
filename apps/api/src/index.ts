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

type CronSpec = {
  slug: string
  intervalMs: number
  schedule: { value: number; unit: 'minute' | 'hour' }
  // Minutes the Sentry monitor tolerates a late check-in before marking "missed".
  checkinMargin: number
  // Minutes a check-in can remain "in_progress" before the monitor marks "timeout".
  maxRuntime: number
  run: () => Promise<void>
}

function scheduleCron(spec: CronSpec): void {
  let running = false
  setInterval(() => {
    if (running) {
      // Previous tick still in flight — skip rather than stacking parallel runs.
      // `checkinMargin` covers the resulting gap for the Sentry monitor.
      console.warn(`[Cron] ${spec.slug} skipped (previous run in flight)`)
      return
    }
    running = true
    Sentry.withMonitor(
      spec.slug,
      async () => {
        try {
          await spec.run()
        } catch (err) {
          console.error(`[Cron] ${spec.slug} failed:`, err)
          throw err
        } finally {
          running = false
        }
      },
      {
        schedule: { type: 'interval', value: spec.schedule.value, unit: spec.schedule.unit },
        checkinMargin: spec.checkinMargin,
        maxRuntime: spec.maxRuntime,
      },
    )
  }, spec.intervalMs)
}

const server: ServerType = serve({ fetch: app.fetch, port }, () => {
  console.log(`m5nita API running on http://localhost:${port}`)

  // Run fixture sync on startup
  syncFixtures().catch((err) => {
    Sentry.captureException(err)
    console.error('[Startup] Fixture sync failed:', err)
  })

  scheduleCron({
    slug: 'fixture-sync',
    intervalMs: 6 * 60 * 60 * 1000,
    schedule: { value: 6, unit: 'hour' },
    checkinMargin: 15,
    maxRuntime: 30,
    run: syncFixtures,
  })

  scheduleCron({
    slug: 'live-score-sync',
    intervalMs: 60 * 1000,
    schedule: { value: 1, unit: 'minute' },
    checkinMargin: 2,
    maxRuntime: 5,
    run: syncLiveScores,
  })

  scheduleCron({
    slug: 'prediction-reminders',
    intervalMs: 15 * 60 * 1000,
    schedule: { value: 15, unit: 'minute' },
    checkinMargin: 5,
    maxRuntime: 10,
    run: sendPredictionReminders,
  })
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
