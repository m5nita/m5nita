import { gradedScoreline } from '../../domain/match/KnockoutResult'
import type {
  MatchData,
  MatchRepository,
  MatchResultUpdate,
} from '../../domain/match/MatchRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import {
  mapDuration,
  mapSyncStatus,
  mapWinner,
} from '../../infrastructure/persistence/mappers/MatchMapper'
import type { ExternalMatch, FootballDataApi } from '../ports/FootballDataApi.port'

export type CompetitionInfo = {
  id: string
  externalId: string
  name: string
}

export type SyncLiveScoresDeps = {
  footballApi: FootballDataApi
  matchRepo: MatchRepository
  clock: Clock
  findActiveCompetitions: () => Promise<CompetitionInfo[]>
  onMatchFinished?: (matchId: string) => Promise<void>
  /** Fired when a match the feed reports finished is held as live for lack of a winner. */
  onMatchHeldAwaitingWinner?: (matchId: string) => Promise<void>
  onAllMatchesChecked?: () => Promise<void>
}

/** Maps a provider match to a persisted result: graded scoreline = 90' (regular time), never extra time/penalties. */
function toResultUpdate(m: ExternalMatch, status: string): MatchResultUpdate {
  const { score } = m
  const graded = gradedScoreline({ fullTime: score.fullTime, regularTime: score.regularTime })
  return {
    homeScore: graded.home ?? 0,
    awayScore: graded.away ?? 0,
    status,
    winner: mapWinner(score.winner),
    duration: mapDuration(score.duration),
    extraTimeHomeScore: score.extraTime?.home ?? null,
    extraTimeAwayScore: score.extraTime?.away ?? null,
    penaltyHomeScore: score.penalties?.home ?? null,
    penaltyAwayScore: score.penalties?.away ?? null,
    minute: m.minute ?? null,
    injuryTime: m.injuryTime ?? null,
  }
}

export class SyncLiveScoresUseCase {
  constructor(private readonly deps: SyncLiveScoresDeps) {}

  async execute(): Promise<void> {
    const competitions = await this.deps.findActiveCompetitions()
    // Query a UTC window of [yesterday, tomorrow] rather than a single day: a
    // match that kicks off late one UTC day and is still live/just-finished
    // after midnight would otherwise drop out of a same-day window, freezing
    // its live score and stalling pool closing. ±1 day is deduped downstream.
    const now = this.deps.clock.now()
    const DAY_MS = 24 * 60 * 60 * 1000
    const dateFrom = new Date(now.getTime() - DAY_MS).toISOString().split('T')[0] as string
    const dateTo = new Date(now.getTime() + DAY_MS).toISOString().split('T')[0] as string

    // First write every match's live score, collecting the ids that just
    // transitioned to finished. The heavier per-match points calc runs only
    // after the whole tick's scores are persisted, so a large pool being scored
    // no longer delays live-score updates for the other matches in the tick.
    const finishedMatchIds: string[] = []
    for (const comp of competitions) {
      finishedMatchIds.push(...(await this.syncCompetition(comp, dateFrom, dateTo)))
    }

    if (this.deps.onMatchFinished) {
      for (const matchId of finishedMatchIds) {
        console.log(`[SyncLiveScores] Match ${matchId} finished, triggering points calc...`)
        await this.deps.onMatchFinished(matchId)
      }
    }

    if (this.deps.onAllMatchesChecked) {
      await this.deps
        .onAllMatchesChecked()
        .catch((err) => console.error('[SyncLiveScores] onAllMatchesChecked failed:', err))
    }
  }

  private async syncCompetition(
    comp: CompetitionInfo,
    dateFrom: string,
    dateTo: string,
  ): Promise<string[]> {
    try {
      const liveMatches = await this.deps.footballApi.fetchLiveMatches(
        comp.externalId,
        dateFrom,
        dateTo,
      )
      const existingMatches = await this.deps.matchRepo.findByCompetition(comp.id)
      const existingByExtId = new Map(existingMatches.map((m) => [m.externalId, m]))

      const finished: string[] = []
      for (const m of liveMatches) {
        const existing = existingByExtId.get(String(m.id))
        if (existing) {
          const finishedId = await this.applyLiveMatch(m, existing)
          if (finishedId) finished.push(finishedId)
        }
      }
      return finished
    } catch (err) {
      console.error(`[SyncLiveScores] Error syncing ${comp.name}:`, err)
      return []
    }
  }

  /** Persists the live score; returns the match id if it just transitioned to finished. */
  private async applyLiveMatch(m: ExternalMatch, existing: MatchData): Promise<string | null> {
    const { status: newStatus, heldForWinner } = mapSyncStatus(m.status, m.score, m.utcDate)
    const wasNotFinished = existing.status !== 'finished'

    await this.deps.matchRepo.updateScores(existing.id, toResultUpdate(m, newStatus))

    // Held = the feed reports finished but there's no winner yet. newStatus stays
    // 'live', so onMatchFinished is suppressed; signal so an admin can be alerted.
    if (heldForWinner && this.deps.onMatchHeldAwaitingWinner) {
      await this.deps.onMatchHeldAwaitingWinner(existing.id)
    }

    return wasNotFinished && newStatus === 'finished' ? existing.id : null
  }
}
