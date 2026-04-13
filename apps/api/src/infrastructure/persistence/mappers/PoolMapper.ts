import { Pool } from '../../../domain/pool/Pool'
import { EntryFee } from '../../../domain/shared/EntryFee'
import { InviteCode } from '../../../domain/shared/InviteCode'
import { MatchdayRange } from '../../../domain/shared/MatchdayRange'
import { PoolStatus } from '../../../domain/shared/PoolStatus'

export type PoolRow = {
  id: string
  name: string
  entryFee: number
  ownerId: string
  inviteCode: string
  competitionId: string
  matchdayFrom: number | null
  matchdayTo: number | null
  couponId: string | null
  status: string
  isOpen: boolean
  createdAt: Date
  updatedAt: Date
}

export function poolToDomain(row: PoolRow): Pool {
  return new Pool(
    row.id,
    row.name,
    EntryFee.of(row.entryFee),
    row.ownerId,
    InviteCode.from(row.inviteCode),
    row.competitionId,
    MatchdayRange.create(row.matchdayFrom, row.matchdayTo),
    PoolStatus.from(row.status),
    row.isOpen,
    row.couponId,
  )
}

export function poolToPersistence(entity: Pool): PoolRow {
  return {
    id: entity.id,
    name: entity.name,
    entryFee: entity.entryFee.value.centavos,
    ownerId: entity.ownerId,
    inviteCode: entity.inviteCode.value,
    competitionId: entity.competitionId,
    matchdayFrom: entity.matchdayRange?.from ?? null,
    matchdayTo: entity.matchdayRange?.to ?? null,
    couponId: entity.couponId,
    status: entity.status.value,
    isOpen: entity.isOpen,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
