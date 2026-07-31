import { notifyPoolWinners } from '../application/pool/notifyPoolWinners'
import { getContainer } from '../container'
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

      await notifyPoolWinners(
        {
          id: p.id,
          name: p.name,
          entryFee: p.entryFee,
          discountPercent: p.discountPercent,
        },
        { poolRepo, rankingRepo, notificationService },
      )
    } catch (err) {
      console.error(`[ClosePoolsJob] Failed to process pool ${p.id}:`, err)
    }
  }

  if (closedCount > 0) {
    console.log(`[ClosePoolsJob] Done. Closed ${closedCount} pool(s).`)
  }
}
