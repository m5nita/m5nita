import { Hono } from 'hono'
import { auth } from '../lib/auth'

const authRoutes = new Hono()

// Better Auth handles all /api/auth/* routes
// Must use on() to match all methods and pass the raw request
authRoutes.on(['GET', 'POST'], '/auth/**', (c) => {
  return auth.handler(c.req.raw)
})

export { authRoutes }
