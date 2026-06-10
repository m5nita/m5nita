import { phoneSchema, updateUserSchema } from '@m5nita/shared'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { getContainer } from '../../../container'
import { db } from '../../../db/client'
import { user } from '../../../db/schema/auth'
import type { AppEnv } from '../../../types/hono'
import { requireAuth } from '../middleware/auth'

const usersRoutes = new Hono<AppEnv>()

usersRoutes.use('/*', requireAuth)

usersRoutes.get('/users/me', async (c) => {
  const currentUser = c.get('user')

  return c.json({
    id: currentUser.id,
    name: currentUser.name,
    phoneNumber: currentUser.phoneNumber,
  })
})

usersRoutes.get('/users/me/pending-prizes', async (c) => {
  const currentUser = c.get('user')
  const result = await getContainer().getPendingPrizesUseCase.execute({
    userId: currentUser.id,
  })
  return c.json(result)
})

// DEPRECATED: the web app now renames users via Better Auth's update-user
// endpoint, which also refreshes the session cookie cache (this raw UPDATE
// does not, so get-session serves the old name for up to 5 minutes). Kept only
// for already-deployed PWA bundles; remove after the tournament.
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

usersRoutes.patch('/users/me/phone', async (c) => {
  const currentUser = c.get('user')
  const body = await c.req.json()
  const parsed = phoneSchema.safeParse(body.phoneNumber)

  if (!parsed.success) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Telefone inválido' }, 400)
  }

  const existing = await db.query.user.findFirst({
    where: eq(user.phoneNumber, parsed.data),
  })

  if (existing && existing.id !== currentUser.id) {
    return c.json(
      { error: 'CONFLICT', message: 'Este telefone já está vinculado a outra conta' },
      409,
    )
  }

  // A phone change must NOT grant verified status: ownership of the new number
  // is only proven by completing the phone OTP flow (Better Auth's phone-number
  // plugin). Setting it false here forces re-verification at next phone sign-in
  // and prevents claiming/squatting a number the user does not control.
  const [updated] = await db
    .update(user)
    .set({ phoneNumber: parsed.data, phoneNumberVerified: false, updatedAt: new Date() })
    .where(eq(user.id, currentUser.id))
    .returning({ id: user.id, phoneNumber: user.phoneNumber })

  return c.json(updated)
})

export { usersRoutes }
