import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { user } from '../db/schema/auth'
import { requireAuth } from '../middleware/auth'
import { updateUserSchema } from '@manita/shared'

const usersRoutes = new Hono()

usersRoutes.use('/*', requireAuth)

usersRoutes.get('/users/me', async (c) => {
  const currentUser = c.get('user')

  return c.json({
    id: currentUser.id,
    name: currentUser.name,
    phoneNumber: currentUser.phoneNumber,
  })
})

usersRoutes.patch('/users/me', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json()
  const parsed = updateUserSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { error: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      400,
    )
  }

  const [updated] = await db
    .update(user)
    .set({ name: parsed.data.name, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id))
    .returning({ id: user.id, name: user.name, phoneNumber: user.phoneNumber })

  if (!updated) {
    return c.json({ error: 'NOT_FOUND', message: 'Usuário não encontrado' }, 404)
  }

  return c.json(updated)
})

export { usersRoutes }
