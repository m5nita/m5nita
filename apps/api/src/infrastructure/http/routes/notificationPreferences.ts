import { updateNotificationPreferenceSchema } from '@m5nita/shared'
import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { NotificationError } from '../../../domain/notification/NotificationError'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const notificationPreferencesRoutes = new Hono<AppEnv>()

notificationPreferencesRoutes.use('/*', requireAuth)

const STATUS_MAP: Record<NotificationError['code'], 404 | 409> = {
  UNKNOWN_TYPE: 404,
  TYPE_LOCKED: 409,
}

// GET /api/notification-preferences — the catalog resolved for the caller.
notificationPreferencesRoutes.get('/notification-preferences', async (c) => {
  const currentUser = c.get('user')
  const result = await getContainer().getNotificationPreferencesUseCase.execute({
    userId: currentUser.id,
  })
  return c.json(result)
})

// PATCH /api/notification-preferences — change one type, get the whole list back.
notificationPreferencesRoutes.patch('/notification-preferences', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json().catch(() => null)
  const parsed = updateNotificationPreferenceSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Preferência inválida' }, 400)
  }

  try {
    const result = await getContainer().updateNotificationPreferencesUseCase.execute({
      userId: currentUser.id,
      code: parsed.data.code,
      enabled: parsed.data.enabled,
    })
    return c.json(result)
  } catch (err) {
    if (err instanceof NotificationError) {
      return c.json({ error: err.code, message: err.message }, STATUS_MAP[err.code])
    }
    throw err
  }
})

export { notificationPreferencesRoutes }
