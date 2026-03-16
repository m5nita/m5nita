import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { auth } from './lib/auth'
import { usersRoutes } from './routes/users'
import { poolsRoutes } from './routes/pools'
import { webhooksRoutes } from './routes/webhooks'
import { matchesRoutes } from './routes/matches'
import { predictionsRoutes } from './routes/predictions'
import { rankingRoutes } from './routes/ranking'
import { globalRateLimit } from './middleware/rateLimit'
import { syncFixtures, syncLiveScores } from './services/match'

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }),
)

app.use('/api/*', globalRateLimit)

// Better Auth — mounted directly, no auth middleware
app.all('/api/auth/*', (c) => auth.handler(c.req.raw))

// Webhooks — no auth middleware (uses Stripe signature)
app.route('/api', webhooksRoutes)

// Protected routes
app.route('/api', usersRoutes)
app.route('/api', poolsRoutes)
app.route('/api', matchesRoutes)
app.route('/api', predictionsRoutes)
app.route('/api', rankingRoutes)

app.get('/api/health', (c) => c.json({ status: 'ok' }))

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message, message: err.cause?.toString() ?? err.message }, err.status)
  }
  console.error('Unhandled error:', err)
  return c.json({ error: 'INTERNAL_ERROR', message: 'Erro interno do servidor' }, 500)
})

app.notFound((c) => {
  return c.json({ error: 'NOT_FOUND', message: 'Rota nao encontrada' }, 404)
})

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, () => {
  console.log(`Manita API running on http://localhost:${port}`)

  // Run fixture sync on startup
  syncFixtures().catch((err) => console.error('[Startup] Fixture sync failed:', err))

  // Schedule cron jobs
  // Sync fixtures every 6 hours
  setInterval(() => {
    syncFixtures().catch((err) => console.error('[Cron] Fixture sync failed:', err))
  }, 6 * 60 * 60 * 1000)

  // Sync live scores every minute
  setInterval(() => {
    syncLiveScores().catch((err) => console.error('[Cron] Live sync failed:', err))
  }, 60 * 1000)
})

export default app
export type AppType = typeof app
