// Sentry MUST be the first import so it can instrument http/https before other modules load.
// Side-effect import keeps Biome's import sorter from reordering it.
import './lib/instrument'

import type { ServerType } from '@hono/node-server'
import { serve } from '@hono/node-server'
import * as Sentry from '@sentry/node'
import { buildApp } from './app'
import { createLiveSyncCompetitionProvider } from './application/match/liveSyncCompetitionProvider'
import { SyncFixturesUseCase } from './application/match/SyncFixturesUseCase'
import { SyncLiveScoresUseCase } from './application/match/SyncLiveScoresUseCase'
import { getContainer } from './container'
import { FootballDataApiAdapter } from './infrastructure/external/FootballDataApiAdapter'
import { calcPointsForMatch } from './jobs/calcPoints'
import { checkAndClosePools } from './jobs/closePoolsJob'
import { sendPredictionReminders } from './jobs/reminderJob'
import { CallBudget } from './lib/callBudget'
import { findActiveCompetitionsForSync } from './services/competition'

const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY ?? ''
// football-data.org limit: 20 calls/min today, 10/min after the World Cup.
// The live-sync self-throttles to stay at or under this; flip it via env, no deploy code change.
const FOOTBALL_DATA_MAX_CALLS_PER_MIN = Number(process.env.FOOTBALL_DATA_MAX_CALLS_PER_MIN ?? '20')

/**
 * Match-sync runners backed by the hexagonal use cases. Built lazily (the
 * container resolves the match repo + clock) and gated on the API key, mirroring
 * the previous behaviour without the legacy `services/match.ts` duplication.
 */
function buildMatchSyncRunners() {
  const footballApi = new FootballDataApiAdapter(FOOTBALL_DATA_API_KEY)
  const { matchRepo, clock } = getContainer()

  const syncFixturesUseCase = new SyncFixturesUseCase({
    footballApi,
    matchRepo,
    findActiveCompetitions: findActiveCompetitionsForSync,
    onMatchFinished: calcPointsForMatch,
  })
  const liveSyncBudget = new CallBudget(FOOTBALL_DATA_MAX_CALLS_PER_MIN)
  const liveSyncCompetitions = createLiveSyncCompetitionProvider({
    listActive: findActiveCompetitionsForSync,
    findLiveOrImminentCompetitionIds: (now) =>
      matchRepo.findCompetitionIdsWithLiveOrImminent(10 * 60_000, 30 * 60_000, now),
    budget: liveSyncBudget,
    clock,
  })

  const syncLiveScoresUseCase = new SyncLiveScoresUseCase({
    footballApi,
    matchRepo,
    clock,
    findActiveCompetitions: liveSyncCompetitions,
    onMatchFinished: calcPointsForMatch,
    onAllMatchesChecked: checkAndClosePools,
  })

  return {
    syncFixtures: async () => {
      if (!FOOTBALL_DATA_API_KEY) {
        console.warn('[Match Sync] FOOTBALL_DATA_API_KEY not set, skipping fixtures sync')
        return
      }
      await syncFixturesUseCase.execute()
    },
    syncLiveScores: async () => {
      if (!FOOTBALL_DATA_API_KEY) return
      await syncLiveScoresUseCase.execute()
    },
  }
}

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
  // Crontab expression (UTC). Sent to the Sentry monitor so missed/timeout windows
  // are computed against the wall clock instead of process boot time — restarts
  // no longer drift the schedule and trigger spurious "missed check-in" alerts.
  crontab: string
  // Alignment interval for the next wall-clock tick. Must match the crontab's
  // frequency (e.g. '*/15 * * * *' → 15 * 60_000). Works for any interval that
  // divides 24h, since the Unix epoch is aligned to 00:00 UTC.
  intervalMs: number
  // Minutes the Sentry monitor tolerates a late check-in before marking "missed".
  checkinMargin: number
  // Minutes a check-in can remain "in_progress" before the monitor marks "timeout".
  maxRuntime: number
  run: () => Promise<void>
}

function scheduleCron(spec: CronSpec): void {
  let running = false

  const scheduleNext = () => {
    const now = Date.now()
    const next = Math.ceil((now + 1) / spec.intervalMs) * spec.intervalMs
    setTimeout(tick, next - now).unref()
  }

  const tick = async () => {
    if (running) {
      // Previous tick still in flight — skip rather than stacking parallel runs.
      // `checkinMargin` covers the resulting gap for the Sentry monitor.
      console.warn(`[Cron] ${spec.slug} skipped (previous run in flight)`)
      scheduleNext()
      return
    }
    running = true
    try {
      await Sentry.withMonitor(spec.slug, () => spec.run(), {
        schedule: { type: 'crontab', value: spec.crontab },
        checkinMargin: spec.checkinMargin,
        maxRuntime: spec.maxRuntime,
      })
    } catch (err) {
      console.error(`[Cron] ${spec.slug} failed:`, err)
    } finally {
      running = false
      scheduleNext()
    }
  }

  // Run immediately on boot so a restart still produces a check-in and refreshes
  // data right away. Subsequent runs align to wall-clock crontab boundaries.
  void tick()
}

const server: ServerType = serve({ fetch: app.fetch, port }, () => {
  console.log(`m5nita API running on http://localhost:${port}`)

  const matchSync = buildMatchSyncRunners()

  scheduleCron({
    slug: 'fixture-sync',
    crontab: '0 */6 * * *',
    intervalMs: 6 * 60 * 60 * 1000,
    checkinMargin: 15,
    maxRuntime: 30,
    run: matchSync.syncFixtures,
  })

  scheduleCron({
    slug: 'live-score-sync',
    crontab: '* * * * *',
    // 30s tick: only competitions with a live/imminent match are actually
    // fetched, and the per-minute call budget caps external calls — so idle
    // ticks just run one cheap indexed DB query and return.
    intervalMs: 30 * 1000,
    checkinMargin: 2,
    maxRuntime: 5,
    run: matchSync.syncLiveScores,
  })

  scheduleCron({
    slug: 'prediction-reminders',
    crontab: '*/15 * * * *',
    intervalMs: 15 * 60 * 1000,
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
