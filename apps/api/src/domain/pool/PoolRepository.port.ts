import type { PoolStatus } from '../shared/PoolStatus'
import type { Pool } from './Pool'

export type PoolWithDetails = {
  id: string
  name: string
  entryFee: number
  ownerId: string
  inviteCode: string
  competitionId: string
  matchdayFrom: number | null
  matchdayTo: number | null
  matchId: string | null
  status: string
  isOpen: boolean
  couponId: string | null
  owner: { id: string; name: string }
  competitionName: string
  coupon: { discountPercent: number } | null
  memberCount: number
  prizeTotal: number
  hasLiveMatch: boolean
}

export type PoolMemberInfo = {
  userId: string
  name: string | null
}

export type PoolMemberWithContact = PoolMemberInfo & {
  phoneNumber: string | null
  email: string | null
  emailVerified: boolean
}

export type PoolListStatusFilter = 'active' | 'closed'

export type PoolListItem = {
  id: string
  name: string
  entryFee: number
  status: string
  competitionName: string
  memberCount: number
  nextMatchAt: Date | null
  lastMatchAt: Date | null
  hasLiveMatch: boolean
}

export type ActivePoolInfo = {
  id: string
  name: string
  entryFee: number
  competitionId: string
  matchdayFrom: number | null
  matchdayTo: number | null
  matchId: string | null
  discountPercent: number
}

export interface PoolRepository {
  findById(id: string): Promise<Pool | null>
  findByIdWithDetails(id: string): Promise<PoolWithDetails | null>
  findByInviteCode(code: string): Promise<PoolWithDetails | null>
  findActiveByCompetition(competitionId: string): Promise<Pool[]>
  findAllActive(): Promise<ActivePoolInfo[]>
  save(pool: Pool): Promise<Pool>
  delete(id: string): Promise<void>
  updateStatus(id: string, status: PoolStatus): Promise<void>
  getMemberCount(poolId: string): Promise<number>
  isMember(poolId: string, userId: string): Promise<boolean>
  /**
   * Idempotent membership insert (`ON CONFLICT (pool_id, user_id) DO NOTHING`).
   * Returns true when the membership row was created, false when the user was
   * already a member.
   */
  addMember(poolId: string, userId: string, paymentId: string): Promise<boolean>
  removeMember(poolId: string, userId: string): Promise<void>
  findUserPools(userId: string, status?: PoolListStatusFilter): Promise<PoolListItem[]>
  getMembers(poolId: string): Promise<PoolMemberInfo[]>
  getMembersWithContact(poolId: string): Promise<PoolMemberWithContact[]>
}
