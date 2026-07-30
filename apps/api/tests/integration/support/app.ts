/**
 * Test app builder. Constructs a Hono app wired to a per-test container
 * (TestClock + stubbed Telegram + optional overrides). Callers receive an
 * in-process `fetch` dispatcher — no HTTP socket is opened.
 */

import type { Bot } from 'grammy'
import type { Hono } from 'hono'
import { buildApp } from '../../../src/app'
import type { ContainerOverrides } from '../../../src/container'
import { resetContainer } from '../../../src/container'
import { db } from '../../../src/db/client'
import { CompositeNotificationService } from '../../../src/infrastructure/external/CompositeNotificationService'
import { WebPushNotificationService } from '../../../src/infrastructure/external/WebPushNotificationService'
import { DrizzleMatchPointsNotifiedStore } from '../../../src/infrastructure/persistence/DrizzleMatchPointsNotifiedStore'
import { DrizzleNotificationPreferencesRepository } from '../../../src/infrastructure/persistence/DrizzleNotificationPreferencesRepository'
import { DrizzlePushSubscriptionRepository } from '../../../src/infrastructure/persistence/DrizzlePushSubscriptionRepository'
import { testOtpInbox } from '../../../src/lib/testHooks'
import type { AppEnv } from '../../../src/types/hono'
import { telegramStub } from './stubs'
import { TestClock } from './TestClock'

export type TestApp = {
  app: Hono<AppEnv>
  clock: TestClock
  otpInbox: Map<string, string>
  container: ReturnType<typeof resetContainer>
}

export type BuildTestAppOptions = {
  initialNow?: Date | string
  overrides?: Omit<ContainerOverrides, 'clock' | 'notificationService'>
  clock?: TestClock
}

export function buildTestApp(options: BuildTestAppOptions = {}): TestApp {
  const clock = options.clock ?? new TestClock(options.initialNow)

  testOtpInbox.clear()

  const telegramBot = telegramStub.bot as unknown as Bot
  const pushRepo = new DrizzlePushSubscriptionRepository(db)
  const notificationService = new CompositeNotificationService(
    telegramBot,
    new WebPushNotificationService(pushRepo),
    new DrizzleMatchPointsNotifiedStore(db),
    new DrizzleNotificationPreferencesRepository(db),
  )

  const container = resetContainer({
    clock,
    notificationService,
    ...(options.overrides ?? {}),
  })

  const app = buildApp()

  return { app, clock, otpInbox: testOtpInbox, container }
}
