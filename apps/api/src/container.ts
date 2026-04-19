import { POOL } from '@m5nita/shared'
import { CreatePoolUseCase } from './application/pool/CreatePoolUseCase'
import { GetPoolDetailsUseCase } from './application/pool/GetPoolDetailsUseCase'
import { GetUserPoolsUseCase } from './application/pool/GetUserPoolsUseCase'
import { JoinPoolUseCase } from './application/pool/JoinPoolUseCase'
import type { PaymentGateway } from './application/ports/PaymentGateway.port'
import { GetMatchPredictionsUseCase } from './application/prediction/GetMatchPredictionsUseCase'
import { GetUserPredictionsUseCase } from './application/prediction/GetUserPredictionsUseCase'
import { UpsertPredictionUseCase } from './application/prediction/UpsertPredictionUseCase'
import { GetPrizeInfoUseCase } from './application/prize/GetPrizeInfoUseCase'
import { RequestWithdrawalUseCase } from './application/prize/RequestWithdrawalUseCase'
import { db } from './db/client'
import { InfinitePayPaymentGateway } from './infrastructure/external/InfinitePayPaymentGateway'
import { MercadoPagoPaymentGateway } from './infrastructure/external/MercadoPagoPaymentGateway'
import { MockPaymentGateway } from './infrastructure/external/MockPaymentGateway'
import { StripePaymentGateway } from './infrastructure/external/StripePaymentGateway'
import { TelegramNotificationService } from './infrastructure/external/TelegramNotificationService'
import { DrizzleMatchRepository } from './infrastructure/persistence/DrizzleMatchRepository'
import { DrizzlePoolRepository } from './infrastructure/persistence/DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './infrastructure/persistence/DrizzlePredictionRepository'
import { DrizzlePrizeWithdrawalRepository } from './infrastructure/persistence/DrizzlePrizeWithdrawalRepository'
import { DrizzleRankingRepository } from './infrastructure/persistence/DrizzleRankingRepository'
import { infinitePayConfig } from './lib/infinitepay'
import { mercadoPagoClient } from './lib/mercadopago'
import { stripe } from './lib/stripe'
import { bot } from './lib/telegram'
import { getCompetitionById } from './services/competition'
import { getEffectiveFeeRate, incrementUsage, validateCoupon } from './services/coupon'

function buildPaymentGateway(): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY
  const isProd = process.env.NODE_ENV === 'production'

  if (!provider && !isProd) {
    return new MockPaymentGateway(db)
  }

  if (provider === 'stripe') {
    if (stripe) return new StripePaymentGateway(stripe, db)
    if (isProd) {
      throw new Error('PAYMENT_GATEWAY=stripe but STRIPE_SECRET_KEY is missing or invalid')
    }
    console.warn(
      '[Stripe] No valid STRIPE_SECRET_KEY configured. Payment features will use mock mode.',
    )
    return new MockPaymentGateway(db)
  }

  if (provider === 'mercadopago') {
    if (mercadoPagoClient) return new MercadoPagoPaymentGateway(mercadoPagoClient, db)
    if (isProd) {
      throw new Error(
        'PAYMENT_GATEWAY=mercadopago but MERCADOPAGO_ACCESS_TOKEN is missing or invalid',
      )
    }
    console.warn(
      '[MercadoPago] No valid MERCADOPAGO_ACCESS_TOKEN configured. Payment features will use mock mode.',
    )
    return new MockPaymentGateway(db)
  }

  if (provider === 'infinitepay') {
    if (infinitePayConfig) return new InfinitePayPaymentGateway(infinitePayConfig.handle, db)
    if (isProd) {
      throw new Error('PAYMENT_GATEWAY=infinitepay but INFINITEPAY_HANDLE is missing')
    }
    console.warn(
      '[InfinitePay] No INFINITEPAY_HANDLE configured. Payment features will use mock mode.',
    )
    return new MockPaymentGateway(db)
  }

  throw new Error(
    `Invalid PAYMENT_GATEWAY: "${provider}" (expected "stripe", "mercadopago", or "infinitepay")`,
  )
}

function buildContainer() {
  const poolRepo = new DrizzlePoolRepository(db)
  const predictionRepo = new DrizzlePredictionRepository(db)
  const prizeWithdrawalRepo = new DrizzlePrizeWithdrawalRepository(db)
  const rankingRepo = new DrizzleRankingRepository(db)
  const matchRepo = new DrizzleMatchRepository(db)

  const paymentGateway = buildPaymentGateway()

  const notificationService = new TelegramNotificationService(bot)

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
