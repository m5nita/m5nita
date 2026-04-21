import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import postgres from 'postgres'
import {
  adminConnectionString,
  baseConnectionString,
  TEMPLATE_DB_NAME,
  templateConnectionString,
} from '../support/db-utils'

const API_ROOT = resolve(__dirname, '..', '..', '..')

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

async function recreateTemplate() {
  await withAdminClient(async (sql) => {
    await terminateConnections(sql, TEMPLATE_DB_NAME)
    await sql.unsafe(
      `UPDATE pg_database SET datistemplate = false WHERE datname = '${TEMPLATE_DB_NAME}'`,
    )
    await sql.unsafe(`DROP DATABASE IF EXISTS ${TEMPLATE_DB_NAME}`)
    await sql.unsafe(`CREATE DATABASE ${TEMPLATE_DB_NAME}`)
  })
}

function applyMigrationsTo(databaseUrl: string) {
  execSync('pnpm drizzle-kit migrate', {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  })
}

async function markAsTemplate() {
  await withAdminClient(async (sql) => {
    await sql.unsafe(
      `UPDATE pg_database SET datistemplate = true WHERE datname = '${TEMPLATE_DB_NAME}'`,
    )
  })
}

async function dropAllWorkerDatabases() {
  await withAdminClient(async (sql) => {
    const rows = await sql<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname LIKE 'm5nita_test_w%'
    `
    for (const row of rows) {
      try {
        await terminateConnections(sql, row.datname)
        await sql.unsafe(`DROP DATABASE IF EXISTS ${row.datname}`)
      } catch (err) {
        console.warn(`[integration teardown] failed to drop ${row.datname}:`, err)
      }
    }
  })
}

export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'Integration tests require DATABASE_URL. Run `docker compose up -d postgres-test` and set DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test',
    )
  }

  console.log('[integration] building template DB...')
  await recreateTemplate()
  applyMigrationsTo(templateConnectionString())
  await markAsTemplate()
  process.env.BASE_DATABASE_URL = baseConnectionString()
  console.log('[integration] template DB ready.')
}

export async function teardown() {
  await dropAllWorkerDatabases()
  await withAdminClient(async (sql) => {
    try {
      await sql.unsafe(
        `UPDATE pg_database SET datistemplate = false WHERE datname = '${TEMPLATE_DB_NAME}'`,
      )
      await terminateConnections(sql, TEMPLATE_DB_NAME)
      await sql.unsafe(`DROP DATABASE IF EXISTS ${TEMPLATE_DB_NAME}`)
    } catch {
      // ignore
    }
  })
}
