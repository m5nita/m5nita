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
import { TelegramNotificationService } from '../../../src/infrastructure/external/TelegramNotificationService'
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
  const notificationService = new TelegramNotificationService(telegramBot)

  const container = resetContainer({
    clock,
    notificationService,
    ...(options.overrides ?? {}),
  })

  const app = buildApp()

  return { app, clock, otpInbox: testOtpInbox, container }
}
