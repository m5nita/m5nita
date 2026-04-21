/**
 * Lightweight FailureRecorder: captures the last HTTP request/response a test
 * made through the auth helper, plus the contents of watched DB tables at the
 * moment of failure. On failure, writes a JSON bundle to .artifacts/.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type postgres from 'postgres'
import type { StubCallLog } from './stubs/types'

type HttpPair = {
  request: { method: string; path: string; body: string | null }
  response: { status: number; body: string | null }
}

const ARTIFACTS_DIR = resolve(__dirname, '..', '.artifacts')

function slugify(s: string): string {
  return s
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
}

export class FailureRecorder {
  private tables: string[] = []
  private lastHttp: HttpPair | null = null

  watch(...tables: string[]) {
    this.tables = tables
  }

  recordHttp(pair: HttpPair) {
    this.lastHttp = pair
  }

  async writeBundle(opts: {
    scenario: string
    worker: string
    now: Date
    error: { message: string; stack?: string }
    sql?: ReturnType<typeof postgres>
    stubCalls: StubCallLog[]
  }): Promise<string | null> {
    try {
      mkdirSync(ARTIFACTS_DIR, { recursive: true })
      const rows: Record<string, unknown[]> = {}
      if (opts.sql) {
        for (const t of this.tables) {
          try {
            rows[t] = await opts.sql.unsafe(`SELECT * FROM ${t} LIMIT 50`)
          } catch {
            rows[t] = [{ _error: `could not read table ${t}` }]
          }
        }
      }
      const bundle = {
        scenario: opts.scenario,
        failedAt: new Date().toISOString(),
        worker: opts.worker,
        clock: { now: opts.now.toISOString() },
        watchedRows: rows,
        stubCalls: opts.stubCalls,
        lastHttp: this.lastHttp,
        error: opts.error,
      }
      const file = resolve(ARTIFACTS_DIR, `${slugify(opts.scenario)}.json`)
      writeFileSync(file, JSON.stringify(bundle, null, 2))
      return file
    } catch (err) {
      console.warn('[FailureRecorder] failed to write bundle:', err)
      return null
    }
  }
}
