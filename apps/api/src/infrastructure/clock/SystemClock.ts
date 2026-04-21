import type { Clock } from '../../domain/shared/Clock'

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
