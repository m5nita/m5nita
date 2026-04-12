import { POOL } from '@m5nita/shared'
import { and, eq } from 'drizzle-orm'
import { CancelPoolUseCase } from './application/pool/CancelPoolUseCase'
import { CreatePoolUseCase } from './application/pool/CreatePoolUseCase'
import { GetPoolDetailsUseCase } from './application/pool/GetPoolDetailsUseCase'
import { GetUserPoolsUseCase } from './application/pool/GetUserPoolsUseCase'
import { JoinPoolUseCase } from './application/pool/JoinPoolUseCase'
import { GetMatchPredictionsUseCase } from './application/prediction/GetMatchPredictionsUseCase'
import { GetUserPredictionsUseCase } from './application/prediction/GetUserPredictionsUseCase'
import { UpsertPredictionUseCase } from './application/prediction/UpsertPredictionUseCase'
import { GetPrizeInfoUseCase } from './application/prize/GetPrizeInfoUseCase'
import { RequestWithdrawalUseCase } from './application/prize/RequestWithdrawalUseCase'
import { MockPaymentGateway } from './infrastructure/external/MockPaymentGateway'
import { StripePaymentGateway } from './infrastructure/external/StripePaymentGateway'
import { TelegramNotificationService } from './infrastructure/external/TelegramNotificationService'
import { DrizzleMatchRepository } from './infrastructure/persistence/DrizzleMatchRepository'
import { DrizzlePoolRepository } from './infrastructure/persistence/DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './infrastructure/persistence/DrizzlePredictionRepository'
import { DrizzlePrizeWithdrawalRepository } from './infrastructure/persistence/DrizzlePrizeWithdrawalRepository'
import { DrizzleRankingRepository } from './infrastructure/persistence/DrizzleRankingRepository'
import { getCompetitionById } from './services/competition'
import { getEffectiveFeeRate, incrementUsage, validateCoupon } from './services/coupon'

function getDb() {
  return require('./db/client').db
}

function getStripe() {
  return require('./lib/stripe').stripe
}

function getBot() {
  return require('./lib/telegram').bot
}

function getPayment() {
  return require('./db/schema/payment').payment
}

function buildContainer() {
  const db = getDb()
  const stripe = getStripe()
  const bot = getBot()
  const payment = getPayment()

  const poolRepo = new DrizzlePoolRepository(db)
  const predictionRepo = new DrizzlePredictionRepository(db)
  const prizeWithdrawalRepo = new DrizzlePrizeWithdrawalRepository(db)
  const rankingRepo = new DrizzleRankingRepository(db)
  const matchRepo = new DrizzleMatchRepository(db)

  const paymentGateway = stripe ? new StripePaymentGateway(stripe, db) : new MockPaymentGateway(db)

  const notificationService = new TelegramNotificationService(bot)

  async function hasPrizePayments(poolId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(payment)
      .where(and(eq(payment.poolId, poolId), eq(payment.type, 'prize')))
      .limit(1)
    return !!row
  }

  async function getCompletedEntryPayments(poolId: string) {
    const rows = await db.query.payment.findMany({
      where: and(
        eq(payment.poolId, poolId),
        eq(payment.type, 'entry'),
        eq(payment.status, 'completed'),
      ),
    })
    return rows.map((r: { id: string; userId: string; amount: number }) => ({
      id: r.id,
      userId: r.userId,
      amount: r.amount,
    }))
  }

  return {
    createPoolUseCase: new CreatePoolUseCase(
      poolRepo,
      paymentGateway,
      { validateCoupon, incrementUsage, getEffectiveFeeRate },
      getCompetitionById,
      POOL.PLATFORM_FEE_RATE,
    ),
    joinPoolUseCase: new JoinPoolUseCase(poolRepo, paymentGateway),
    cancelPoolUseCase: new CancelPoolUseCase(
      poolRepo,
      paymentGateway,
      hasPrizePayments,
      getCompletedEntryPayments,
    ),
    getPoolDetailsUseCase: new GetPoolDetailsUseCase(poolRepo),
    getUserPoolsUseCase: new GetUserPoolsUseCase(poolRepo),
    upsertPredictionUseCase: new UpsertPredictionUseCase(predictionRepo, poolRepo, matchRepo),
    getUserPredictionsUseCase: new GetUserPredictionsUseCase(predictionRepo, poolRepo),
    getMatchPredictionsUseCase: new GetMatchPredictionsUseCase(predictionRepo, poolRepo, matchRepo),
    getPrizeInfoUseCase: new GetPrizeInfoUseCase(
      poolRepo,
      prizeWithdrawalRepo,
      rankingRepo,
      getEffectiveFeeRate,
    ),
    requestWithdrawalUseCase: new RequestWithdrawalUseCase(
      poolRepo,
      prizeWithdrawalRepo,
      rankingRepo,
      notificationService,
      getEffectiveFeeRate,
    ),
  }
}

let _container: ReturnType<typeof buildContainer> | null = null

export function getContainer() {
  if (!_container) {
    _container = buildContainer()
  }
  return _container
}
