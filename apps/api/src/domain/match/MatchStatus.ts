export type MatchStatusValue = 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled'

export class MatchStatus {
  static readonly Scheduled = new MatchStatus('scheduled')
  static readonly Live = new MatchStatus('live')
  static readonly Finished = new MatchStatus('finished')
  static readonly Postponed = new MatchStatus('postponed')
  static readonly Cancelled = new MatchStatus('cancelled')

  private static readonly ALL = new Map<string, MatchStatus>([
    ['scheduled', MatchStatus.Scheduled],
    ['live', MatchStatus.Live],
    ['finished', MatchStatus.Finished],
    ['postponed', MatchStatus.Postponed],
    ['cancelled', MatchStatus.Cancelled],
  ])

  /**
   * Statuses a match never leaves: finished (played out) or cancelled (will
   * never be played). Single source of truth for "this match is done", used by
   * both `isTerminal()` and the pool-closing query — a cancelled match must not
   * keep its pool open (and its prize stuck) forever.
   */
  static readonly TERMINAL_VALUES: readonly MatchStatusValue[] = ['finished', 'cancelled']

  readonly value: MatchStatusValue

  private constructor(value: MatchStatusValue) {
    this.value = value
  }

  static from(value: string): MatchStatus {
    const status = MatchStatus.ALL.get(value)
    if (!status) throw new Error(`Invalid match status: ${value}`)
    return status
  }

  isScheduled(): boolean {
    return this.value === 'scheduled'
  }
  isLive(): boolean {
    return this.value === 'live'
  }
  isFinished(): boolean {
    return this.value === 'finished'
  }
  isOngoing(): boolean {
    return this.value === 'scheduled' || this.value === 'live'
  }
  isTerminal(): boolean {
    return MatchStatus.TERMINAL_VALUES.includes(this.value)
  }
}
