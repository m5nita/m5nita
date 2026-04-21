import { describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'

describe('smoke', () => {
  it('health endpoint returns ok', async () => {
    const { app } = buildTestApp()
    const resp = await app.fetch(new Request('http://localhost/api/health'))
    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual({ status: 'ok' })
  })

  it('test clock is injectable', async () => {
    const { clock } = buildTestApp({ initialNow: '2026-06-11T12:00:00.000Z' })
    expect(clock.now().toISOString()).toBe('2026-06-11T12:00:00.000Z')
    clock.advance(60_000)
    expect(clock.now().toISOString()).toBe('2026-06-11T12:01:00.000Z')
  })
})
