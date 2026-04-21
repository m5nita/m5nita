import { Pool } from '../../domain/pool/Pool'
import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { MatchdayRange } from '../../domain/shared/MatchdayRange'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { CheckoutResult, PaymentGateway } from '../ports/PaymentGateway.port'

type CouponValidationResult =
  | { valid: true; couponId: string; discountPercent: number }
  | { valid: false; reason: string }

type CouponDeps = {
  validateCoupon: (code: string) => Promise<CouponValidationResult>
  incrementUsage: (couponId: string) => Promise<boolean>
  getEffectiveFeeRate: (discountPercent: number) => number
}

type CompetitionFinder = (id: string) => Promise<{ id: string; status: string } | null>

type Input = {
  userId: string
  name: string
  entryFee: number
  competitionId: string
  matchdayFrom?: number
  matchdayTo?: number
  couponCode?: string
}

type Output = {
  pool: Pool
  payment: CheckoutResult
  platformFee: number
  originalPlatformFee: number
  discountPercent: number
  couponCode: string | null
}

export class CreatePoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly coupon: CouponDeps,
    private readonly findCompetition: CompetitionFinder,
    private readonly baseFeeRate: number,
  ) {}

  async execute(input: Input): Promise<Output> {
    const comp = await this.findCompetition(input.competitionId)
    if (!comp) throw new PoolError('INVALID_COMPETITION', 'Competição não encontrada')
    if (comp.status !== 'active')
      throw new PoolError('INVALID_COMPETITION', 'Competição não está ativa')

    let couponId: string | null = null
    let discountPercent = 0

    if (input.couponCode) {
      const result = await this.coupon.validateCoupon(input.couponCode)
      if (!result.valid) throw new PoolError('INVALID_COUPON', `Cupom inválido: ${result.reason}`)
      couponId = result.couponId
      discountPercent = result.discountPercent
    }

    const entryFee = EntryFee.of(input.entryFee)
    const effectiveRate = this.coupon.getEffectiveFeeRate(discountPercent)
    const platformFee = Math.floor(input.entryFee * effectiveRate)
    const originalPlatformFee = Math.floor(input.entryFee * this.baseFeeRate)

    const pool = new Pool(
      crypto.randomUUID(),
      input.name,
      entryFee,
      input.userId,
      InviteCode.generate(),
      input.competitionId,
      MatchdayRange.create(input.matchdayFrom ?? null, input.matchdayTo ?? null),
      PoolStatus.Pending,
      true,
      couponId,
    )

    // Pool must be persisted before the gateway runs: every gateway inserts a
    // payment row with FK to pool.id as part of createCheckoutSession. If the
    // gateway fails, we compensate by deleting the pool — otherwise a retry
    // would leave an orphan row. The adapter is responsible for cleaning up
    // its own payment row on failure.
    const saved = await this.poolRepo.save(pool)

    let payment: CheckoutResult
    try {
      payment = await this.paymentGateway.createCheckoutSession({
        userId: input.userId,
        poolId: saved.id,
        amount: input.entryFee,
        platformFee,
      })
    } catch (err) {
      await this.poolRepo.delete(saved.id)
      throw err
    }

    if (couponId && !(await this.coupon.incrementUsage(couponId))) {
      throw new PoolError('COUPON_EXHAUSTED', 'Cupom atingiu o limite de utilizações')
    }

    return {
      pool: saved,
      payment,
      platformFee,
      originalPlatformFee,
      discountPercent,
      couponCode: input.couponCode?.trim().toUpperCase() ?? null,
    }
  }
}
