import { type MyPerformanceResponse, phoneSchema } from '@m5nita/shared'
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

usersRoutes.get('/users/me/performance', async (c) => {
  const currentUser = c.get('user')
  const s = await getContainer().getMyPerformanceUseCase.execute({ userId: currentUser.id })
  const body: MyPerformanceResponse = {
    participei: s.participei,
    vitorias: s.vitorias,
    derrotas: s.derrotas,
    emAndamento: s.emAndamento,
    aproveitamento: s.aproveitamento,
    gasteiCentavos: s.gastei.centavos,
    premiosConquistadosCentavos: s.premiosConquistados.centavos,
    aSacarCentavos: s.aSacar.centavos,
    saldoCentavos: s.saldo.centavos,
    maiorPremioCentavos: s.maiorPremio ? s.maiorPremio.centavos : null,
    evolucao: s.evolucao.map((p) => ({
      poolId: p.poolId,
      settledAt: p.settledAt ? p.settledAt.toISOString() : null,
      saldoCentavos: p.cumulativeSaldoCentavos,
    })),
  }
  return c.json(body)
})

// Renames go through Better Auth's update-user endpoint (which refreshes the
// session cookie cache); only the phone change keeps a custom route because it
// must reset phoneNumberVerified for OTP re-verification.
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
