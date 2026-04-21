import { URL } from 'node:url'

export const TEMPLATE_DB_NAME = 'm5nita_test_template'

export function baseConnectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is required for integration tests. Example: postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test',
    )
  }
  return url
}

function replaceDatabase(urlString: string, databaseName: string): string {
  const u = new URL(urlString)
  u.pathname = `/${databaseName}`
  return u.toString()
}

export function adminConnectionString(): string {
  return replaceDatabase(baseConnectionString(), 'postgres')
}

export function templateConnectionString(): string {
  return replaceDatabase(baseConnectionString(), TEMPLATE_DB_NAME)
}

export function workerDbName(): string {
  const id = process.env.VITEST_POOL_ID ?? '1'
  return `m5nita_test_w${id}`
}

export function workerConnectionString(): string {
  return replaceDatabase(baseConnectionString(), workerDbName())
}
