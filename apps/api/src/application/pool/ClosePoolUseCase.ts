import { Match } from '../../domain/match/Match'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { MatchStatus } from '../../domain/match/MatchStatus'
import { PoolClosurePolicy } from '../../domain/pool/PoolClosurePolicy'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { PoolStatus } from '../../domain/shared/PoolStatus'
import type { NotificationService } from '../ports/NotificationService.port'
import { notifyPoolWinners } from './notifyPoolWinners'

export type ClosePoolBlockingMatch = { id: string; label: string; live: boolean }
export type ClosePoolStrandedMatch = { id: string; label: string; status: string }
export type ClosePoolWinner = { userId: string; name: string | null; totalPoints: number }

export type ClosePoolResult =
  | { outcome: 'not-found' }
  | { outcome: 'not-active'; poolName: string; status: string }
  | { outcome: 'blocked'; poolName: string; blocking: ClosePoolBlockingMatch[] }
  | {
      outcome: 'closed'
      poolName: string
      stranded: ClosePoolStrandedMatch[]
      blocking: ClosePoolBlockingMatch[]
      winners: ClosePoolWinner[]
      prizeShare: number
    }

export type ClosePoolInput = {
  inviteCode: string
  /** Close even when a match can still be played or predicted. */
  force: boolean
}

export type ClosePoolDeps = {
  poolRepo: PoolRepository
  matchRepo: MatchRepository
  rankingRepo: RankingRepository
  notificationService: NotificationService
  clock: Clock
}

function toMatch(row: MatchData): Match {
  return new Match(
    row.id,
    row.competitionId,
    row.matchDate,
    row.matchday,
    MatchStatus.from(row.status),
    row.homeScore,
    row.awayScore,
  )
}

function label(row: MatchData): string {
  return `${row.homeTeam} × ${row.awayTeam}`
}

/**
 * Admin action: close one pool by its invite code, even when matches in its
 * scope never happened. A pool whose remaining fixtures were postponed would
 * otherwise stay `active` forever — and its prize locked, since prize reads
 * refuse a pool that is not closed.
 *
 * Mirrors `FinalizeMatchUseCase`: an escape hatch, not a rule. The automatic
 * path (`closePoolsJob`) is untouched and still waits for every in-scope match.
 *
 * Refusal is an expected outcome, so this returns a discriminated union rather
 * than throwing — every branch is then type-checked at the call site.
 */
export class ClosePoolUseCase {
  constructor(private readonly deps: ClosePoolDeps) {}

  async execute(input: ClosePoolInput): Promise<ClosePoolResult> {
    const code = input.inviteCode.trim().toUpperCase()
    const details = await this.deps.poolRepo.findByInviteCode(code)
    if (!details) return { outcome: 'not-found' }

    if (details.status !== 'active') {
      return { outcome: 'not-active', poolName: details.name, status: details.status }
    }

    const pool = await this.deps.poolRepo.findById(details.id)
    if (!pool) return { outcome: 'not-found' }

    const now = this.deps.clock.now()
    const rows = await this.deps.matchRepo.findUnfinishedFor(pool.unfinishedMatchesQuery())
    const blockingRows = rows.filter((row) => PoolClosurePolicy.blocks(toMatch(row), now))
    const strandedRows = rows.filter((row) => !PoolClosurePolicy.blocks(toMatch(row), now))

    const blocking: ClosePoolBlockingMatch[] = blockingRows.map((row) => ({
      id: row.id,
      label: label(row),
      live: MatchStatus.from(row.status).isLive(),
    }))

    if (blocking.length > 0 && !input.force) {
      return { outcome: 'blocked', poolName: details.name, blocking }
    }

    pool.close()
    await this.deps.poolRepo.updateStatus(pool.id, PoolStatus.Closed)

    const notified = await notifyPoolWinners(
      {
        id: details.id,
        name: details.name,
        entryFee: details.entryFee,
        discountPercent: details.coupon?.discountPercent ?? 0,
      },
      {
        poolRepo: this.deps.poolRepo,
        rankingRepo: this.deps.rankingRepo,
        notificationService: this.deps.notificationService,
      },
    )

    return {
      outcome: 'closed',
      poolName: details.name,
      stranded: strandedRows.map((row) => ({
        id: row.id,
        label: label(row),
        status: row.status,
      })),
      blocking,
      winners: notified.winners.map((w) => ({
        userId: w.userId,
        name: w.name,
        totalPoints: w.totalPoints,
      })),
      prizeShare: notified.prizeShare,
    }
  }
}
