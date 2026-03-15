import type { Context, Next } from 'hono'
import { auth } from '../lib/auth'

export async function requireAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Autenticacao necessaria' }, 401)
  }

  c.set('user', session.user)
  c.set('session', session.session)
  await next()
}

export async function requirePoolOwner(c: Context, next: Next) {
  const user = c.get('user')
  const poolId = c.req.param('poolId')

  if (!user || !poolId) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Autenticacao necessaria' }, 401)
  }

  // Pool ownership check will be done in the service layer
  // This middleware just ensures the user context is available
  await next()
}
