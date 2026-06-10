import { gradedScoreline } from '../../domain/match/KnockoutResult'
import type {
  MatchData,
  MatchRepository,
  MatchResultUpdate,
} from '../../domain/match/MatchRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import {
  mapDuration,
  mapStatus,
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
  onAllMatchesChecked?: () => Promise<void>
}

/** Maps a provider score to a persisted result: graded scoreline = 90' (regular time), never extra time/penalties. */
function toResultUpdate(score: ExternalMatch['score'], status: string): MatchResultUpdate {
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

    for (const comp of competitions) {
      await this.syncCompetition(comp, dateFrom, dateTo)
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
  ): Promise<void> {
    try {
      const liveMatches = await this.deps.footballApi.fetchLiveMatches(
        comp.externalId,
        dateFrom,
        dateTo,
      )
      const existingMatches = await this.deps.matchRepo.findByCompetition(comp.id)
      const existingByExtId = new Map(existingMatches.map((m) => [m.externalId, m]))

      for (const m of liveMatches) {
        const existing = existingByExtId.get(String(m.id))
        if (existing) await this.applyLiveMatch(m, existing)
      }
    } catch (err) {
      console.error(`[SyncLiveScores] Error syncing ${comp.name}:`, err)
    }
  }

  private async applyLiveMatch(m: ExternalMatch, existing: MatchData): Promise<void> {
    const newStatus = mapStatus(m.status, m.score, m.utcDate)
    const wasNotFinished = existing.status !== 'finished'

    await this.deps.matchRepo.updateScores(existing.id, toResultUpdate(m.score, newStatus))

    if (wasNotFinished && newStatus === 'finished' && this.deps.onMatchFinished) {
      console.log(`[SyncLiveScores] Match ${existing.id} finished, triggering points calc...`)
      await this.deps.onMatchFinished(existing.id)
    }
  }
}
