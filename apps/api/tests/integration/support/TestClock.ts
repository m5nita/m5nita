import type { Clock } from '../../../src/domain/shared/Clock'

export class TestClock implements Clock {
  private current: Date

  constructor(initial: Date | string = '2026-06-11T12:00:00.000Z') {
    const d = new Date(initial)
    if (Number.isNaN(d.getTime())) {
      throw new Error(`TestClock: invalid initial date ${initial}`)
    }
    this.current = d
  }

  now(): Date {
    return new Date(this.current)
  }

  setNow(d: Date | string): void {
    const next = new Date(d)
    if (Number.isNaN(next.getTime())) {
      throw new Error(`TestClock.setNow: invalid date ${d}`)
    }
    this.current = next
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms)
  }
}
