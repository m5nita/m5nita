import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { authRoutes } from './routes/auth'
import { usersRoutes } from './routes/users'
import { poolsRoutes } from './routes/pools'
import { webhooksRoutes } from './routes/webhooks'
import { matchesRoutes } from './routes/matches'
import { predictionsRoutes } from './routes/predictions'
import { rankingRoutes } from './routes/ranking'
import { globalRateLimit } from './middleware/rateLimit'

const app = new Hono()

app.use(
  '/api/*',
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  }),
)

app.use('/api/*', globalRateLimit)

app.route('/api', authRoutes)
app.route('/api', usersRoutes)
app.route('/api', poolsRoutes)
app.route('/api', webhooksRoutes)
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
})

export default app
export type AppType = typeof app
