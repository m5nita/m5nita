import type { Context, Next } from 'hono'
import { auth } from '../../../lib/auth'
import type { AppEnv } from '../../../types/hono'

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })

  if (!session) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Autenticação necessária' }, 401)
  }

  c.set('user', session.user)
  c.set('session', session.session)
  await next()
}
