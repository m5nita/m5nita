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
import { db } from './db/client'
import { payment } from './db/schema/payment'
import { MercadoPagoPaymentGateway } from './infrastructure/external/MercadoPagoPaymentGateway'
import { MockPaymentGateway } from './infrastructure/external/MockPaymentGateway'
import { TelegramNotificationService } from './infrastructure/external/TelegramNotificationService'
import { DrizzleMatchRepository } from './infrastructure/persistence/DrizzleMatchRepository'
import { DrizzlePoolRepository } from './infrastructure/persistence/DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './infrastructure/persistence/DrizzlePredictionRepository'
import { DrizzlePrizeWithdrawalRepository } from './infrastructure/persistence/DrizzlePrizeWithdrawalRepository'
import { DrizzleRankingRepository } from './infrastructure/persistence/DrizzleRankingRepository'
import { mercadoPagoClient } from './lib/mercadopago'
import { bot } from './lib/telegram'
import { getCompetitionById } from './services/competition'
import { getEffectiveFeeRate, incrementUsage, validateCoupon } from './services/coupon'

function buildContainer() {
  const mpClient = mercadoPagoClient

  const poolRepo = new DrizzlePoolRepository(db)
  const predictionRepo = new DrizzlePredictionRepository(db)
  const prizeWithdrawalRepo = new DrizzlePrizeWithdrawalRepository(db)
  const rankingRepo = new DrizzleRankingRepository(db)
  const matchRepo = new DrizzleMatchRepository(db)

  const paymentGateway = mpClient
    ? new MercadoPagoPaymentGateway(mpClient, db)
    : new MockPaymentGateway(db)

  const notificationService = new TelegramNotificationService(bot)

  async function hasPrizePayments(poolId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(payment)
      .where(and(eq(payment.poolId, poolId), eq(payment.type, 'prize')))
      .limit(1)
    return !!row
  }

  return {
    // Repos & services (used by jobs and other infrastructure entry points)
    poolRepo,
    predictionRepo,
    rankingRepo,
    matchRepo,
    notificationService,
    getEffectiveFeeRate,

    // Use cases
    createPoolUseCase: new CreatePoolUseCase(
      poolRepo,
      paymentGateway,
      { validateCoupon, incrementUsage, getEffectiveFeeRate },
      getCompetitionById,
      POOL.PLATFORM_FEE_RATE,
    ),
    joinPoolUseCase: new JoinPoolUseCase(poolRepo, paymentGateway),
    cancelPoolUseCase: new CancelPoolUseCase(poolRepo, hasPrizePayments),
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
