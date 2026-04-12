import type { PoolStatus } from '../shared/PoolStatus'
import type { Pool } from './Pool'

export type PoolWithDetails = {
  id: string
  name: string
  entryFee: number
  ownerId: string
  inviteCode: string
  competitionId: string
  matchdayStart: number | null
  matchdayEnd: number | null
  status: string
  isOpen: boolean
  couponId: string | null
  owner: { id: string; name: string }
  competitionName: string
  coupon: { discountPercent: number } | null
  memberCount: number
  prizeTotal: number
}

export type PoolListItem = {
  id: string
  name: string
  entryFee: number
  status: string
  competitionName: string
  memberCount: number
  userPosition: number | null
  userPoints: number
}

export interface PoolRepository {
  findById(id: string): Promise<Pool | null>
  findByInviteCode(code: string): Promise<PoolWithDetails | null>
  findActiveByCompetition(competitionId: string): Promise<Pool[]>
  save(pool: Pool): Promise<Pool>
  updateStatus(id: string, status: PoolStatus): Promise<void>
  getMemberCount(poolId: string): Promise<number>
  isMember(poolId: string, userId: string): Promise<boolean>
  addMember(poolId: string, userId: string, paymentId: string): Promise<void>
  removeMember(poolId: string, userId: string): Promise<void>
  findUserPools(userId: string): Promise<PoolListItem[]>
}
