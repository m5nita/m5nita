import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeCalculation } from '../../domain/prize/PrizeCalculation'
import type { RankingEntry, RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { EntryFee } from '../../domain/shared/EntryFee'
import { FeePolicy } from '../../domain/shared/FeePolicy'
import type { NotificationService, WinnerInfo } from '../ports/NotificationService.port'

export type PoolPrizeContext = {
  id: string
  name: string
  entryFee: number
  discountPercent: number
}

export type PoolWinnerDeps = {
  poolRepo: Pick<PoolRepository, 'getMemberCount' | 'getMembersWithContact'>
  rankingRepo: Pick<RankingRepository, 'getPoolRanking'>
  notificationService: Pick<NotificationService, 'notifyWinners'>
}

export type PoolWinnersNotified = {
  /** First-place entries, in ranking order. Empty when nobody scored. */
  winners: RankingEntry[]
  /** Centavos each winner receives; 0 when there is no winner. */
  prizeShare: number
}

/**
 * Tell a just-closed pool's first-place members they won, with each one's share
 * of the prize.
 *
 * Extracted from `closePoolsJob` so the admin close path (`ClosePoolUseCase`)
 * sends the same notification through the same prize math: a manually closed
 * pool must be indistinguishable from one the job closed.
 */
export async function notifyPoolWinners(
  pool: PoolPrizeContext,
  deps: PoolWinnerDeps,
): Promise<PoolWinnersNotified> {
  const ranking = await deps.rankingRepo.getPoolRanking(pool.id, '')
  const winnerEntries = ranking.filter((r) => r.position === 1)
  if (winnerEntries.length === 0) return { winners: [], prizeShare: 0 }

  const memberCount = await deps.poolRepo.getMemberCount(pool.id)
  const feePolicy = FeePolicy.from(pool.discountPercent)
  const prizeTotal = PrizeCalculation.calculatePrizeTotal(
    EntryFee.hydrate(pool.entryFee),
    memberCount,
    feePolicy,
  )
  const prizeShare = PrizeCalculation.calculateWinnerShare(prizeTotal, winnerEntries.length)

  const members = await deps.poolRepo.getMembersWithContact(pool.id)
  const contactByUserId = new Map(members.map((m) => [m.userId, m]))

  const winners: WinnerInfo[] = winnerEntries.map((w) => {
    const contact = contactByUserId.get(w.userId)
    return {
      userId: w.userId,
      name: w.name,
      phoneNumber: contact?.phoneNumber ?? null,
      email: contact?.emailVerified && contact.email ? contact.email : null,
    }
  })

  await deps.notificationService.notifyWinners(pool.id, pool.name, winners, prizeShare.centavos)

  return { winners: winnerEntries, prizeShare: prizeShare.centavos }
}
