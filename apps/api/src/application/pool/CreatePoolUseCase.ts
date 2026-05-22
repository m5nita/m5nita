import { Pool } from '../../domain/pool/Pool'
import { PoolError } from '../../domain/pool/PoolError'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { EntryFee } from '../../domain/shared/EntryFee'
import { InviteCode } from '../../domain/shared/InviteCode'
import { MatchdayRange } from '../../domain/shared/MatchdayRange'
import { PoolScope } from '../../domain/shared/PoolScope'
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

export type MatchSummary = { id: string; competitionId: string; kickoffAt: Date }
export type MatchFinder = (id: string) => Promise<MatchSummary | null>

type Input = {
  userId: string
  name: string
  entryFee: number
  competitionId: string
  matchdayFrom?: number
  matchdayTo?: number
  matchId?: string
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

function buildRangeScope(matchdayFrom: number | null, matchdayTo: number | null): PoolScope {
  const range = MatchdayRange.create(matchdayFrom, matchdayTo)
  return range === null ? PoolScope.wholeCompetition() : PoolScope.fromRange(range)
}

function rejectIfBothScopes(input: Input): void {
  const hasRange = input.matchdayFrom != null || input.matchdayTo != null
  if (input.matchId != null && hasRange) {
    throw new PoolError('INVALID_SCOPE', 'Escolha um único jogo OU uma faixa de rodadas, não ambos')
  }
}

async function resolveSingleMatchScope(
  matchId: string,
  competitionId: string,
  findMatch: MatchFinder,
  clock: Clock,
): Promise<PoolScope> {
  const match = await findMatch(matchId)
  if (!match) throw new PoolError('MATCH_UNAVAILABLE', 'Jogo não encontrado')
  if (match.competitionId !== competitionId) {
    throw new PoolError('MATCH_UNAVAILABLE', 'Jogo não pertence à competição informada')
  }
  if (match.kickoffAt.getTime() <= clock.now().getTime()) {
    throw new PoolError('MATCH_UNAVAILABLE', 'Jogo já começou ou terminou')
  }
  return PoolScope.singleMatch(matchId)
}

export class CreatePoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly paymentGateway: PaymentGateway,
    private readonly coupon: CouponDeps,
    private readonly findCompetition: CompetitionFinder,
    private readonly baseFeeRate: number,
    private readonly findMatch: MatchFinder,
    private readonly clock: Clock,
  ) {}

  async execute(input: Input): Promise<Output> {
    rejectIfBothScopes(input)
    await this.ensureCompetitionActive(input.competitionId)

    const scope =
      input.matchId != null
        ? await resolveSingleMatchScope(
            input.matchId,
            input.competitionId,
            this.findMatch,
            this.clock,
          )
        : buildRangeScope(input.matchdayFrom ?? null, input.matchdayTo ?? null)

    const couponState = await this.resolveCoupon(input.couponCode)
    const entryFee = EntryFee.of(input.entryFee)
    const effectiveRate = this.coupon.getEffectiveFeeRate(couponState.discountPercent)
    const platformFee = Math.floor(input.entryFee * effectiveRate)
    const originalPlatformFee = Math.floor(input.entryFee * this.baseFeeRate)

    const pool = new Pool(
      crypto.randomUUID(),
      input.name,
      entryFee,
      input.userId,
      InviteCode.generate(),
      input.competitionId,
      scope,
      PoolStatus.Pending,
      true,
      couponState.couponId,
    )

    // Pool must be persisted before the gateway runs: every gateway inserts a
    // payment row with FK to pool.id as part of createCheckoutSession. If the
    // gateway fails, we compensate by deleting the pool.
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

    if (couponState.couponId && !(await this.coupon.incrementUsage(couponState.couponId))) {
      throw new PoolError('COUPON_EXHAUSTED', 'Cupom atingiu o limite de utilizações')
    }

    // T031c: structured log carrying scope.kind for SC-005/SC-006 measurement.
    console.log(
      JSON.stringify({
        event: 'pool.created',
        poolId: saved.id,
        scopeKind: saved.scope.kind,
        matchId: saved.scope.matchId,
        competitionId: saved.competitionId,
      }),
    )

    return {
      pool: saved,
      payment,
      platformFee,
      originalPlatformFee,
      discountPercent: couponState.discountPercent,
      couponCode: input.couponCode?.trim().toUpperCase() ?? null,
    }
  }

  private async ensureCompetitionActive(competitionId: string): Promise<void> {
    const comp = await this.findCompetition(competitionId)
    if (!comp) throw new PoolError('INVALID_COMPETITION', 'Competição não encontrada')
    if (comp.status !== 'active') {
      throw new PoolError('INVALID_COMPETITION', 'Competição não está ativa')
    }
  }

  private async resolveCoupon(
    couponCode: string | undefined,
  ): Promise<{ couponId: string | null; discountPercent: number }> {
    if (!couponCode) return { couponId: null, discountPercent: 0 }
    const result = await this.coupon.validateCoupon(couponCode)
    if (!result.valid) throw new PoolError('INVALID_COUPON', `Cupom inválido: ${result.reason}`)
    return { couponId: result.couponId, discountPercent: result.discountPercent }
  }
}
