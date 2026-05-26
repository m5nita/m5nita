import { PrizeCalculation } from '../prize/PrizeCalculation'
import type { EntryFee } from '../shared/EntryFee'
import { FeePolicy } from '../shared/FeePolicy'
import type { InviteCode } from '../shared/InviteCode'
import type { Money } from '../shared/Money'
import type { PoolScope } from '../shared/PoolScope'
import { PoolStatus } from '../shared/PoolStatus'
import { PoolError } from './PoolError'

export class Pool {
  readonly id: string
  readonly name: string
  readonly entryFee: EntryFee
  readonly ownerId: string
  readonly inviteCode: InviteCode
  readonly competitionId: string
  readonly scope: PoolScope
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
    scope: PoolScope,
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
    this.scope = scope
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

  prize(memberCount: number, feePolicy: FeePolicy): Money {
    return PrizeCalculation.calculatePrizeTotal(this.entryFee, memberCount, feePolicy)
  }

  platformFee(feePolicy: FeePolicy): Money {
    return feePolicy.applyTo(this.entryFee.value)
  }

  originalPlatformFee(): Money {
    return FeePolicy.standard().applyTo(this.entryFee.value)
  }
}
