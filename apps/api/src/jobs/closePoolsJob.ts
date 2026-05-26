import { getContainer } from '../container'
import { PrizeCalculation } from '../domain/prize/PrizeCalculation'
import { EntryFee } from '../domain/shared/EntryFee'
import { FeePolicy } from '../domain/shared/FeePolicy'
import { PoolStatus } from '../domain/shared/PoolStatus'

export async function checkAndClosePools(): Promise<void> {
  const { poolRepo, matchRepo, rankingRepo, notificationService } = getContainer()

  const activePools = await poolRepo.findAllActive()

  if (activePools.length === 0) return

  let closedCount = 0

  for (const p of activePools) {
    try {
      const query =
        p.matchId != null
          ? { kind: 'single-match' as const, matchId: p.matchId }
          : {
              kind: 'range' as const,
              competitionId: p.competitionId,
              matchdayFrom: p.matchdayFrom,
              matchdayTo: p.matchdayTo,
            }
      const hasUnfinished = await matchRepo.hasUnfinishedFor(query)

      if (hasUnfinished) continue

      await poolRepo.updateStatus(p.id, PoolStatus.Closed)

      closedCount++

      console.log(`[ClosePoolsJob] Closed pool "${p.name}" (${p.id})`)

      await notifyWinnersForPool(p)
    } catch (err) {
      console.error(`[ClosePoolsJob] Failed to process pool ${p.id}:`, err)
    }
  }

  if (closedCount > 0) {
    console.log(`[ClosePoolsJob] Done. Closed ${closedCount} pool(s).`)
  }

  async function notifyWinnersForPool(p: {
    id: string
    name: string
    entryFee: number
    discountPercent: number
  }) {
    const ranking = await rankingRepo.getPoolRanking(p.id, '')
    const winnerEntries = ranking.filter((r) => r.position === 1)
    if (winnerEntries.length === 0) return

    const memberCount = await poolRepo.getMemberCount(p.id)
    const feePolicy = FeePolicy.from(p.discountPercent)
    const prizeTotal = PrizeCalculation.calculatePrizeTotal(
      EntryFee.of(p.entryFee),
      memberCount,
      feePolicy,
    )
    const prizeShare = PrizeCalculation.calculateWinnerShare(prizeTotal, winnerEntries.length)

    const members = await poolRepo.getMembersWithPhone(p.id)
    const phoneByUserId = new Map(members.map((m) => [m.userId, m.phoneNumber]))

    const winners = winnerEntries.map((w) => ({
      name: w.name,
      phoneNumber: phoneByUserId.get(w.userId) ?? null,
    }))

    await notificationService.notifyWinners(p.name, winners, prizeShare.centavos)
  }
}
