import { FinalizeMatchUseCase } from './application/match/FinalizeMatchUseCase'
import { NotifyMatchPointsUseCase } from './application/match/NotifyMatchPointsUseCase'
import { GetNotificationPreferencesUseCase } from './application/notification/GetNotificationPreferencesUseCase'
import { UpdateNotificationPreferencesUseCase } from './application/notification/UpdateNotificationPreferencesUseCase'
import { CompleteCheckoutUseCase } from './application/payment/CompleteCheckoutUseCase'
import { GetMyPerformanceUseCase } from './application/performance/GetMyPerformanceUseCase'
import { AnnounceNewPoolUseCase } from './application/pool/AnnounceNewPoolUseCase'
import { ClosePoolUseCase } from './application/pool/ClosePoolUseCase'
import { CreatePoolUseCase } from './application/pool/CreatePoolUseCase'
import { GetPoolDetailsUseCase } from './application/pool/GetPoolDetailsUseCase'
import { GetUserPoolsUseCase } from './application/pool/GetUserPoolsUseCase'
import { JoinPoolUseCase } from './application/pool/JoinPoolUseCase'
import type { NotificationService } from './application/ports/NotificationService.port'
import type { PaymentGateway } from './application/ports/PaymentGateway.port'
import { GetMatchPredictionsUseCase } from './application/prediction/GetMatchPredictionsUseCase'
import { GetUserPredictionsUseCase } from './application/prediction/GetUserPredictionsUseCase'
import { UpsertPredictionUseCase } from './application/prediction/UpsertPredictionUseCase'
import { GetPendingPrizesUseCase } from './application/prize/GetPendingPrizesUseCase'
import { GetPrizeInfoUseCase } from './application/prize/GetPrizeInfoUseCase'
import { MarkWithdrawalPaidUseCase } from './application/prize/MarkWithdrawalPaidUseCase'
import { RequestWithdrawalUseCase } from './application/prize/RequestWithdrawalUseCase'
import { SubscribeToPushUseCase } from './application/push/SubscribeToPushUseCase'
import { UnsubscribeFromPushUseCase } from './application/push/UnsubscribeFromPushUseCase'
import { GetParticipantStatsUseCase } from './application/stats/GetParticipantStatsUseCase'
import { UnlockStatsUseCase } from './application/stats/UnlockStatsUseCase'
import { db as defaultDb } from './db/client'
import { Match } from './domain/match/Match'
import { MatchStatus } from './domain/match/MatchStatus'
import type { Clock } from './domain/shared/Clock'
import { StatsUnlockPrice } from './domain/stats/StatsUnlockPrice'
import { SystemClock } from './infrastructure/clock/SystemClock'
import { CompositeNotificationService } from './infrastructure/external/CompositeNotificationService'
import { InfinitePayPaymentGateway } from './infrastructure/external/InfinitePayPaymentGateway'
import { MockPaymentGateway } from './infrastructure/external/MockPaymentGateway'
import { StripePaymentGateway } from './infrastructure/external/StripePaymentGateway'
import { WebPushNotificationService } from './infrastructure/external/WebPushNotificationService'
import { DrizzleMatchPointsNotifiedStore } from './infrastructure/persistence/DrizzleMatchPointsNotifiedStore'
import { DrizzleMatchRepository } from './infrastructure/persistence/DrizzleMatchRepository'
import { DrizzleNotificationPreferencesRepository } from './infrastructure/persistence/DrizzleNotificationPreferencesRepository'
import { DrizzlePerformanceReadRepository } from './infrastructure/persistence/DrizzlePerformanceReadRepository'
import { DrizzlePoolRepository } from './infrastructure/persistence/DrizzlePoolRepository'
import { DrizzlePredictionRepository } from './infrastructure/persistence/DrizzlePredictionRepository'
import { DrizzlePrizeWithdrawalRepository } from './infrastructure/persistence/DrizzlePrizeWithdrawalRepository'
import { DrizzlePushSubscriptionRepository } from './infrastructure/persistence/DrizzlePushSubscriptionRepository'
import { DrizzleRankingRepository } from './infrastructure/persistence/DrizzleRankingRepository'
import { DrizzleStatsRepository } from './infrastructure/persistence/DrizzleStatsRepository'
import { DrizzleStatsUnlockRepository } from './infrastructure/persistence/DrizzleStatsUnlockRepository'
import { DrizzleUnitOfWork } from './infrastructure/persistence/DrizzleUnitOfWork'
import { DrizzleUserDirectory } from './infrastructure/persistence/DrizzleUserDirectory'
import { infinitePayConfig } from './lib/infinitepay'
import { stripe } from './lib/stripe'
import { bot } from './lib/telegram'
import { getCompetitionById } from './services/competition'
import { incrementUsage, validateCoupon } from './services/coupon'
import { participantStatsAggregateCache, participantStatsMatchesCache } from './services/statsCache'

type Db = typeof defaultDb

export type ContainerOverrides = Partial<{
  db: Db
  clock: Clock
  paymentGateway: PaymentGateway
  notificationService: NotificationService
}>

type GatewaySpec = {
  build: (db: Db) => PaymentGateway | null
  missingEnvError: string
  mockReason: string
}

const GATEWAY_SPECS: Record<string, GatewaySpec> = {
  stripe: {
    build: (db) => (stripe ? new StripePaymentGateway(stripe, db) : null),
    missingEnvError: 'PAYMENT_GATEWAY=stripe but STRIPE_SECRET_KEY is missing or invalid',
    mockReason:
      '[Stripe] No valid STRIPE_SECRET_KEY configured. Payment features will use mock mode.',
  },
  infinitepay: {
    build: (db) =>
      infinitePayConfig ? new InfinitePayPaymentGateway(infinitePayConfig.handle, db) : null,
    missingEnvError: 'PAYMENT_GATEWAY=infinitepay but INFINITEPAY_HANDLE is missing',
    mockReason:
      '[InfinitePay] No INFINITEPAY_HANDLE configured. Payment features will use mock mode.',
  },
}

function buildPaymentGateway(
  db: Db,
  completeCheckoutUseCase: CompleteCheckoutUseCase,
): PaymentGateway {
  const provider = process.env.PAYMENT_GATEWAY
  const isProd = process.env.NODE_ENV === 'production'

  if (!provider && !isProd) return new MockPaymentGateway(db, completeCheckoutUseCase)

  const spec = provider ? GATEWAY_SPECS[provider] : undefined
  if (!spec) {
    throw new Error(`Invalid PAYMENT_GATEWAY: "${provider}" (expected "stripe" or "infinitepay")`)
  }

  const gateway = spec.build(db)
  if (gateway) return gateway

  if (isProd) throw new Error(spec.missingEnvError)
  console.warn(spec.mockReason)
  return new MockPaymentGateway(db, completeCheckoutUseCase)
}

// Injected by the composition root (index.ts) so the container never imports
// jobs/calcPoints — that import would form a container ↔ calcPoints cycle, since
// calcPoints resolves getContainer(). Defaults to throwing so a misconfigured
// boot surfaces loudly instead of silently skipping a re-score.
let rescoreHook: (matchId: string) => Promise<void> = async () => {
  throw new Error('match rescore hook not registered')
}

export function registerMatchRescore(fn: (matchId: string) => Promise<void>): void {
  rescoreHook = fn
}

export function buildContainer(overrides: ContainerOverrides = {}) {
  const db = overrides.db ?? defaultDb
  const clock = overrides.clock ?? new SystemClock()

  const poolRepo = new DrizzlePoolRepository(db)
  const predictionRepo = new DrizzlePredictionRepository(db)
  const prizeWithdrawalRepo = new DrizzlePrizeWithdrawalRepository(db)
  const rankingRepo = new DrizzleRankingRepository(db)
  const performanceReadRepo = new DrizzlePerformanceReadRepository(db)
  const matchRepo = new DrizzleMatchRepository(db)
  const statsUnlockRepo = new DrizzleStatsUnlockRepository(db)
  const statsRepo = new DrizzleStatsRepository(db)
  const pushSubscriptionRepo = new DrizzlePushSubscriptionRepository(db)
  const matchPointsNotifiedStore = new DrizzleMatchPointsNotifiedStore(db)
  const notificationPreferencesRepo = new DrizzleNotificationPreferencesRepository(db)
  const userDirectory = new DrizzleUserDirectory(db)
  const unitOfWork = new DrizzleUnitOfWork(db)

  // Cached per-pool stats loaders (siblings of the ranking cache): the aggregate
  // (per-member counts) and the per-match series (evolution lines). Both are
  // anonymized, shared across viewers, and busted on match finish.
  const loadPoolStatsAggregate = (poolId: string) =>
    participantStatsAggregateCache.getOrCompute(poolId, () => statsRepo.poolAggregate(poolId))
  const loadPoolStatsMatches = (poolId: string) =>
    participantStatsMatchesCache.getOrCompute(poolId, () => statsRepo.poolMatchPoints(poolId))

  // Notifications are wired before the checkout use case because confirming a
  // payment now announces the pool it activated.
  const webPushService = new WebPushNotificationService(pushSubscriptionRepo)
  const notificationService =
    overrides.notificationService ??
    new CompositeNotificationService(
      bot,
      webPushService,
      matchPointsNotifiedStore,
      notificationPreferencesRepo,
    )

  const announceNewPoolUseCase = new AnnounceNewPoolUseCase(
    poolRepo,
    userDirectory,
    notificationService,
    async (matchId) => {
      const found = await matchRepo.findById(matchId)
      return found ? { homeTeam: found.homeTeam, awayTeam: found.awayTeam } : null
    },
  )

  const completeCheckoutUseCase = new CompleteCheckoutUseCase(unitOfWork, (poolId) =>
    announceNewPoolUseCase.execute({ poolId }),
  )
  const paymentGateway =
    overrides.paymentGateway ?? buildPaymentGateway(db, completeCheckoutUseCase)

  const statsUnlockPriceEnv = process.env.STATS_UNLOCK_PRICE_CENTAVOS
  const statsUnlockPrice = statsUnlockPriceEnv
    ? StatsUnlockPrice.of(Number(statsUnlockPriceEnv))
    : StatsUnlockPrice.default()

  const getPrizeInfoUseCase = new GetPrizeInfoUseCase(poolRepo, prizeWithdrawalRepo, rankingRepo)
  const getPendingPrizesUseCase = new GetPendingPrizesUseCase(poolRepo, getPrizeInfoUseCase)
  const getMyPerformanceUseCase = new GetMyPerformanceUseCase(performanceReadRepo, rankingRepo)

  const notifyMatchPointsUseCase = new NotifyMatchPointsUseCase(
    matchRepo,
    poolRepo,
    predictionRepo,
    rankingRepo,
    notificationService,
  )

  const finalizeMatchUseCase = new FinalizeMatchUseCase({
    matchRepo,
    rescore: (matchId: string) => rescoreHook(matchId),
  })

  const closePoolUseCase = new ClosePoolUseCase({
    poolRepo,
    matchRepo,
    rankingRepo,
    notificationService,
    clock,
  })

  return {
    db,
    clock,
    poolRepo,
    predictionRepo,
    rankingRepo,
    matchRepo,
    statsUnlockRepo,
    statsRepo,
    pushSubscriptionRepo,
    notificationPreferencesRepo,
    notificationService,
    paymentGateway,
    unitOfWork,

    completeCheckoutUseCase,
    announceNewPoolUseCase,
    getNotificationPreferencesUseCase: new GetNotificationPreferencesUseCase(
      notificationPreferencesRepo,
    ),
    updateNotificationPreferencesUseCase: new UpdateNotificationPreferencesUseCase(
      notificationPreferencesRepo,
    ),
    subscribeToPushUseCase: new SubscribeToPushUseCase(pushSubscriptionRepo),
    unsubscribeFromPushUseCase: new UnsubscribeFromPushUseCase(pushSubscriptionRepo),
    notifyMatchPointsUseCase,
    finalizeMatchUseCase,
    closePoolUseCase,
    createPoolUseCase: new CreatePoolUseCase(
      poolRepo,
      paymentGateway,
      { validateCoupon, incrementUsage },
      getCompetitionById,
      async (id) => {
        const m = await matchRepo.findById(id)
        return m
          ? new Match(
              m.id,
              m.competitionId,
              m.matchDate,
              m.matchday,
              MatchStatus.from(m.status),
              m.homeScore,
              m.awayScore,
            )
          : null
      },
      clock,
    ),
    joinPoolUseCase: new JoinPoolUseCase(poolRepo, paymentGateway),
    getPoolDetailsUseCase: new GetPoolDetailsUseCase(poolRepo),
    getUserPoolsUseCase: new GetUserPoolsUseCase(poolRepo),
    upsertPredictionUseCase: new UpsertPredictionUseCase(
      predictionRepo,
      poolRepo,
      matchRepo,
      clock,
    ),
    getUserPredictionsUseCase: new GetUserPredictionsUseCase(predictionRepo, poolRepo),
    getMatchPredictionsUseCase: new GetMatchPredictionsUseCase(
      predictionRepo,
      poolRepo,
      matchRepo,
      clock,
    ),
    getPrizeInfoUseCase,
    getPendingPrizesUseCase,
    getMyPerformanceUseCase,
    requestWithdrawalUseCase: new RequestWithdrawalUseCase(
      poolRepo,
      prizeWithdrawalRepo,
      rankingRepo,
      notificationService,
    ),
    markWithdrawalPaidUseCase: new MarkWithdrawalPaidUseCase(
      prizeWithdrawalRepo,
      poolRepo,
      notificationService,
    ),
    unlockStatsUseCase: new UnlockStatsUseCase(
      poolRepo,
      statsUnlockRepo,
      paymentGateway,
      statsUnlockPrice,
    ),
    getParticipantStatsUseCase: new GetParticipantStatsUseCase(
      poolRepo,
      statsUnlockRepo,
      statsUnlockPrice,
      statsRepo,
      loadPoolStatsAggregate,
      loadPoolStatsMatches,
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

export function resetContainer(
  overrides: ContainerOverrides = {},
): ReturnType<typeof buildContainer> {
  _container = buildContainer(overrides)
  return _container
}
