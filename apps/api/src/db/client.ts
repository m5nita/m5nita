import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is required')
}

const queryClient = postgres(databaseUrl)

export const db = drizzle(queryClient, { schema })

/** The transaction client drizzle hands to `db.transaction` callbacks. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * What a repository needs to run queries: the root client or a transaction
 * bound to it. `PgTransaction` extends `PgDatabase`, so both expose the same
 * query surface — this is what lets the UnitOfWork hand out tx-bound repos.
 */
export type DbExecutor = typeof db | DbTransaction
