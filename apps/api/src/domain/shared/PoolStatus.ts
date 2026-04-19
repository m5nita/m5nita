export class PoolStatus {
  static readonly Pending = new PoolStatus('pending')
  static readonly Active = new PoolStatus('active')
  static readonly Closed = new PoolStatus('closed')
  static readonly Cancelled = new PoolStatus('cancelled')

  private static readonly ALL = new Map<string, PoolStatus>([
    ['pending', PoolStatus.Pending],
    ['active', PoolStatus.Active],
    ['closed', PoolStatus.Closed],
    ['cancelled', PoolStatus.Cancelled],
  ])

  readonly value: 'pending' | 'active' | 'closed' | 'cancelled'

  private constructor(value: 'pending' | 'active' | 'closed' | 'cancelled') {
    this.value = value
  }

  static from(value: string): PoolStatus {
    const status = PoolStatus.ALL.get(value)
    if (!status) {
      throw new Error(`Invalid pool status: ${value}`)
    }
    return status
  }

  canClose(): boolean {
    return this.value === 'active'
  }

  canJoin(): boolean {
    return this.value === 'active'
  }

  canAcceptPredictions(): boolean {
    return this.value !== 'closed'
  }
}
