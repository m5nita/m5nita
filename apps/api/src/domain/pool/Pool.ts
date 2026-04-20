import type { EntryFee } from '../shared/EntryFee'
import type { InviteCode } from '../shared/InviteCode'
import type { MatchdayRange } from '../shared/MatchdayRange'
import { Money } from '../shared/Money'
import { PoolStatus } from '../shared/PoolStatus'
import { PoolError } from './PoolError'

export class Pool {
  readonly id: string
  readonly name: string
  readonly entryFee: EntryFee
  readonly ownerId: string
  readonly inviteCode: InviteCode
  readonly competitionId: string
  readonly matchdayRange: MatchdayRange | null
  readonly couponId: string | null
  private _status: PoolStatus
  private _isOpen: boolean

  constructor(
    id: string,
    name: string,
    entryFee: EntryFee,
    ownerId: string,
    inviteCode: InviteCode,
    competitionId: string,
    matchdayRange: MatchdayRange | null,
    status: PoolStatus,
    isOpen: boolean,
    couponId: string | null,
  ) {
    this.id = id
    this.name = name
    this.entryFee = entryFee
    this.ownerId = ownerId
    this.inviteCode = inviteCode
    this.competitionId = competitionId
    this.matchdayRange = matchdayRange
    this._status = status
    this._isOpen = isOpen
    this.couponId = couponId
  }

  get status(): PoolStatus {
    return this._status
  }

  get isOpen(): boolean {
    return this._isOpen
  }

  activate(): void {
    this._status = PoolStatus.Active
  }

  close(): void {
    if (!this._status.canClose()) {
      throw new PoolError('INVALID_STATE', 'Pool cannot be closed')
    }
    this._status = PoolStatus.Closed
    this._isOpen = false
  }

  canJoin(): boolean {
    return this._status.canJoin() && this._isOpen
  }

  canAcceptPredictions(): boolean {
    return this._status.canAcceptPredictions()
  }

  isOwnedBy(userId: string): boolean {
    return this.ownerId === userId
  }

  calculatePrize(memberCount: number, effectiveFeeRate: number): Money {
    return Money.of(Math.floor(this.entryFee.value.centavos * memberCount * (1 - effectiveFeeRate)))
  }

  calculatePlatformFee(effectiveFeeRate: number): Money {
    return this.entryFee.value.percentage(effectiveFeeRate)
  }
}
