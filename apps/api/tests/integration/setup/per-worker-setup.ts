/**
 * Runs once per Vitest worker. Must mutate process.env.DATABASE_URL BEFORE any
 * application module is imported — db/client.ts and better-auth both capture
 * the env var at module-load time.
 */

import postgres from 'postgres'
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import {
  adminConnectionString,
  TEMPLATE_DB_NAME,
  workerConnectionString,
  workerDbName,
} from '../support/db-utils'
import { mswServer, resetAllStubs } from '../support/stubs'

// Override DATABASE_URL for this worker ASAP.
process.env.DATABASE_URL = workerConnectionString()
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'
// Auth helper expects a known Turnstile stub token; production guard accepts it only in test.
process.env.TURNSTILE_SECRET_KEY =
  process.env.TURNSTILE_SECRET_KEY ?? '1x0000000000000000000000000000000AA'
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'test-secret-0000000000000000000000'
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3001'
process.env.ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173'
process.env.PIX_ENCRYPTION_KEY =
  process.env.PIX_ENCRYPTION_KEY ?? 'test-pix-key-000000000000000000000000'
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_000000000000000000000000'
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id-test'
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret-test'
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '000000:test-telegram-token'
process.env.TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET ?? 'test-telegram-webhook-secret'
process.env.TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'test_bot'

async function withAdminClient<T>(
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  const sql = postgres(adminConnectionString(), { max: 1, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function terminateConnections(sql: ReturnType<typeof postgres>, dbName: string) {
  await sql.unsafe(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '${dbName}' AND pid <> pg_backend_pid()
  `)
}

export async function resetWorkerDb() {
  const dbName = workerDbName()
  await withAdminClient(async (sql) => {
    await terminateConnections(sql, dbName)
    await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName}`)
    await sql.unsafe(`CREATE DATABASE ${dbName} WITH TEMPLATE ${TEMPLATE_DB_NAME}`)
  })
}

async function dropWorkerDb() {
  const dbName = workerDbName()
  await withAdminClient(async (sql) => {
    try {
      await terminateConnections(sql, dbName)
      await sql.unsafe(`DROP DATABASE IF EXISTS ${dbName}`)
    } catch {
      // ignore
    }
  })
}

beforeAll(async () => {
  await resetWorkerDb()
  mswServer.listen({ onUnhandledRequest: 'error' })
})

beforeEach(async () => {
  await resetWorkerDb()
})

afterEach(() => {
  mswServer.resetHandlers()
  resetAllStubs()
})

afterAll(async () => {
  mswServer.close()
  await dropWorkerDb()
})
