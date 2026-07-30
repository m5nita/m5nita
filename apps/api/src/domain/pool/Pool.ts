import { PrizeCalculation } from '../prize/PrizeCalculation'
import {
  RangeScoringPolicy,
  type ScoringPolicy,
  SingleMatchScoringPolicy,
} from '../scoring/ScoringPolicy'
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
  /**
   * The creator asked for the whole base to be told about this pool. Intent
   * captured at creation, acted on once the entry payment is confirmed. Trailing
   * and optional so no existing construction site had to change.
   */
  readonly notifyOnCreate: boolean
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
    notifyOnCreate = false,
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
    this.notifyOnCreate = notifyOnCreate
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

  scoringPolicy(): ScoringPolicy {
    return this.scope.kind === 'single-match' ? SingleMatchScoringPolicy : RangeScoringPolicy
  }

  /** Whether the paid per-participant statistics panel means anything here. */
  supportsParticipantStats(): boolean {
    return this.scope.supportsParticipantStats()
  }

  /**
   * Whether a match belongs to this pool: same competition AND inside the
   * pool's scope (whole-competition / matchday range / single match). This is
   * the single source of truth for "is this match part of the pool" — used by
   * both the read path (viewing predictions) and the write path (submitting
   * one), so a member cannot accrue ranking points on a match the pool does
   * not cover.
   */
  includesMatch(match: { id: string; competitionId: string; matchday: number | null }): boolean {
    if (match.competitionId !== this.competitionId) {
      return false
    }
    return this.scope.contains({ id: match.id, matchday: match.matchday })
  }

  /**
   * Describes which matches must finish for this pool to be closable. The
   * repository adapter translates the query into SQL; callers don't branch
   * on `scope.matchId`.
   */
  unfinishedMatchesQuery(): UnfinishedMatchesQuery {
    if (this.scope.kind === 'single-match' && this.scope.matchId) {
      return { kind: 'single-match', matchId: this.scope.matchId }
    }
    return {
      kind: 'range',
      competitionId: this.competitionId,
      matchdayFrom: this.scope.range?.from ?? null,
      matchdayTo: this.scope.range?.to ?? null,
    }
  }
}

export type UnfinishedMatchesQuery =
  | { kind: 'single-match'; matchId: string }
  | {
      kind: 'range'
      competitionId: string
      matchdayFrom: number | null
      matchdayTo: number | null
    }
