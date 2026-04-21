import type postgres from 'postgres'

export type TestCoupon = {
  id: string
  code: string
  discountPercent: number
  maxUses: number | null
}

export async function makeCoupon(
  sql: ReturnType<typeof postgres>,
  overrides: Partial<{
    code: string
    discountPercent: number
    maxUses: number | null
  }> = {},
): Promise<TestCoupon> {
  const id = crypto.randomUUID()
  const code = (
    overrides.code ?? `TEST${crypto.randomUUID().slice(0, 6).toUpperCase()}`
  ).toUpperCase()
  const discountPercent = overrides.discountPercent ?? 50
  const maxUses = overrides.maxUses ?? null

  await sql`
    INSERT INTO "coupon" (id, code, discount_percent, status, max_uses, use_count, created_by_telegram_id)
    VALUES (${id}, ${code}, ${discountPercent}, 'active', ${maxUses}, 0, 1)
  `

  return { id, code, discountPercent, maxUses }
}
