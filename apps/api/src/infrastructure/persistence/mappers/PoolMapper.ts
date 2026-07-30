import { Pool } from '../../../domain/pool/Pool'
import { EntryFee } from '../../../domain/shared/EntryFee'
import { InviteCode } from '../../../domain/shared/InviteCode'
import { PoolScope } from '../../../domain/shared/PoolScope'
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
  matchId: string | null
  couponId: string | null
  status: string
  isOpen: boolean
  notifyOnCreate: boolean
  createdAt: Date
  updatedAt: Date
}

export function poolToDomain(row: PoolRow): Pool {
  return new Pool(
    row.id,
    row.name,
    EntryFee.hydrate(row.entryFee),
    row.ownerId,
    InviteCode.from(row.inviteCode),
    row.competitionId,
    PoolScope.fromRow({
      matchdayFrom: row.matchdayFrom,
      matchdayTo: row.matchdayTo,
      matchId: row.matchId,
    }),
    PoolStatus.from(row.status),
    row.isOpen,
    row.couponId,
    row.notifyOnCreate,
  )
}

export function poolToPersistence(entity: Pool): PoolRow {
  const scope = entity.scope
  return {
    id: entity.id,
    name: entity.name,
    entryFee: entity.entryFee.value.centavos,
    ownerId: entity.ownerId,
    inviteCode: entity.inviteCode.value,
    competitionId: entity.competitionId,
    matchdayFrom: scope.range?.from ?? null,
    matchdayTo: scope.range?.to ?? null,
    matchId: scope.matchId,
    couponId: entity.couponId,
    status: entity.status.value,
    isOpen: entity.isOpen,
    notifyOnCreate: entity.notifyOnCreate,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
