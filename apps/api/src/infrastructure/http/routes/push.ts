import { subscribePushSchema } from '@m5nita/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import { getContainer } from '../../../container'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const unsubscribePushSchema = z.object({ endpoint: z.string().url() })

const pushRoutes = new Hono<AppEnv>()

pushRoutes.use('/*', requireAuth)

// Register (or refresh) this device's subscription for the current user.
pushRoutes.post('/push/subscribe', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = subscribePushSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Inscrição de push inválida' }, 400)
  }

  await getContainer().subscribeToPushUseCase.execute({
    userId: currentUser.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: c.req.header('user-agent') ?? null,
  })
  return c.json({ ok: true }, 201)
})

// Remove this device's subscription on opt-out.
pushRoutes.delete('/push/subscribe', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = unsubscribePushSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Endpoint inválido' }, 400)
  }

  await getContainer().unsubscribeFromPushUseCase.execute({
    userId: currentUser.id,
    endpoint: parsed.data.endpoint,
  })
  return c.json({ ok: true })
})

export { pushRoutes }
