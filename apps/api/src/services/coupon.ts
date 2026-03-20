import { COUPON, POOL } from '@m5nita/shared'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { coupon } from '../db/schema/coupon'

export type CouponValidationError = 'not_found' | 'expired' | 'exhausted' | 'inactive'

interface CreateCouponParams {
  code: string
  discountPercent: number
  expiresAt?: Date | null
  maxUses?: number | null
  createdByTelegramId: number
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function validateCode(code: string): boolean {
  return (
    code.length >= COUPON.MIN_CODE_LENGTH &&
    code.length <= COUPON.MAX_CODE_LENGTH &&
    COUPON.CODE_REGEX.test(code)
  )
}

export async function createCoupon(params: CreateCouponParams) {
  const code = normalizeCode(params.code)

  if (!validateCode(code)) {
    throw new CouponError('VALIDATION_ERROR', 'Código deve ter 2-20 caracteres alfanuméricos')
  }

  if (
    params.discountPercent < COUPON.MIN_DISCOUNT ||
    params.discountPercent > COUPON.MAX_DISCOUNT
  ) {
    throw new CouponError('VALIDATION_ERROR', 'Desconto deve ser entre 1 e 100')
  }

  const existing = await db.query.coupon.findFirst({
    where: eq(coupon.code, code),
  })

  if (existing) {
    throw new CouponError('DUPLICATE_CODE', `Código ${code} já está em uso`)
  }

  const [newCoupon] = await db
    .insert(coupon)
    .values({
      code,
      discountPercent: params.discountPercent,
      expiresAt: params.expiresAt ?? null,
      maxUses: params.maxUses ?? null,
      createdByTelegramId: params.createdByTelegramId,
    })
    .returning()

  return newCoupon as NonNullable<typeof newCoupon>
}

export async function validateCoupon(
  code: string,
): Promise<
  | { valid: true; couponId: string; discountPercent: number }
  | { valid: false; reason: CouponValidationError }
> {
  const normalized = normalizeCode(code)

  const found = await db.query.coupon.findFirst({
    where: eq(coupon.code, normalized),
  })

  if (!found) {
    return { valid: false, reason: 'not_found' }
  }

  if (found.status !== 'active') {
    return { valid: false, reason: 'inactive' }
  }

  if (found.expiresAt && found.expiresAt < new Date()) {
    return { valid: false, reason: 'expired' }
  }

  if (found.maxUses !== null && found.useCount >= found.maxUses) {
    return { valid: false, reason: 'exhausted' }
  }

  return { valid: true, couponId: found.id, discountPercent: found.discountPercent }
}

export async function incrementUsage(couponId: string): Promise<boolean> {
  const result = await db
    .update(coupon)
    .set({
      useCount: sql`"use_count" + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(coupon.id, couponId), sql`("max_uses" IS NULL OR "use_count" < "max_uses")`))

  const { count, rowCount } = result as unknown as { count: number; rowCount: number }
  return (count ?? rowCount ?? 0) > 0
}

export async function deactivateCoupon(code: string) {
  const normalized = normalizeCode(code)

  const found = await db.query.coupon.findFirst({
    where: eq(coupon.code, normalized),
  })

  if (!found) {
    throw new CouponError('NOT_FOUND', `Cupom ${normalized} não encontrado`)
  }

  if (found.status === 'inactive') {
    throw new CouponError('ALREADY_INACTIVE', `Cupom ${normalized} já está inativo`)
  }

  await db
    .update(coupon)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(eq(coupon.id, found.id))
}

export async function listCoupons() {
  return db.query.coupon.findMany({
    orderBy: (c, { desc }) => [desc(c.createdAt)],
  })
}

export function getEffectiveFeeRate(discountPercent: number): number {
  return POOL.PLATFORM_FEE_RATE * (1 - discountPercent / 100)
}

export class CouponError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CouponError'
  }
}
