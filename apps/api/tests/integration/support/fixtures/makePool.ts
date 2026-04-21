import type { TestUser } from '../auth-helper'

export type TestPool = {
  id: string
  inviteCode: string
  entryFeeCentavos: number
  competitionId: string
  ownerId: string
  paymentId: string
  checkoutUrl: string
}

type MakePoolOpts = {
  admin: TestUser
  competitionId: string
  name?: string
  entryFeeCentavos?: number
  matchdayFrom?: number
  matchdayTo?: number
}

export async function makePool(opts: MakePoolOpts): Promise<TestPool> {
  const body: Record<string, unknown> = {
    name: opts.name ?? 'Test Pool',
    entryFee: opts.entryFeeCentavos ?? 10_000,
    competitionId: opts.competitionId,
  }
  if (opts.matchdayFrom != null && opts.matchdayTo != null) {
    body.matchdayFrom = opts.matchdayFrom
    body.matchdayTo = opts.matchdayTo
  }

  const resp = await opts.admin.fetch('/api/pools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (resp.status !== 201) {
    const text = await resp.text()
    throw new Error(`makePool: POST /api/pools returned ${resp.status}: ${text.slice(0, 200)}`)
  }
  const json = (await resp.json()) as {
    pool: {
      id: string
      inviteCode: string
      entryFee: number
      competitionId: string
      ownerId: string
    }
    payment: { id: string; checkoutUrl: string }
  }

  return {
    id: json.pool.id,
    inviteCode: json.pool.inviteCode,
    entryFeeCentavos: json.pool.entryFee,
    competitionId: json.pool.competitionId,
    ownerId: json.pool.ownerId,
    paymentId: json.payment.id,
    checkoutUrl: json.payment.checkoutUrl,
  }
}
