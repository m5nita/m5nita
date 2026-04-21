import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import type { Clock } from '../../domain/shared/Clock'
import { mapStatus } from '../../infrastructure/persistence/mappers/MatchMapper'
import type { FootballDataApi } from '../ports/FootballDataApi.port'

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

export class SyncLiveScoresUseCase {
  constructor(private readonly deps: SyncLiveScoresDeps) {}

  async execute(): Promise<void> {
    const competitions = await this.deps.findActiveCompetitions()
    const today = this.deps.clock.now().toISOString().split('T')[0] as string

    for (const comp of competitions) {
      try {
        const liveMatches = await this.deps.footballApi.fetchLiveMatches(comp.externalId, today)

        const existingMatches = await this.deps.matchRepo.findByCompetition(comp.id)
        const existingByExtId = new Map(existingMatches.map((m) => [m.externalId, m]))

        for (const m of liveMatches) {
          const existing = existingByExtId.get(String(m.id))
          if (!existing) continue

          const newStatus = mapStatus(m.status)
          const wasNotFinished = existing.status !== 'finished'
          const isNowFinished = newStatus === 'finished'

          await this.deps.matchRepo.updateScores(
            existing.id,
            m.score.fullTime.home ?? 0,
            m.score.fullTime.away ?? 0,
            newStatus,
          )

          if (wasNotFinished && isNowFinished && this.deps.onMatchFinished) {
            console.log(`[SyncLiveScores] Match ${existing.id} finished, triggering points calc...`)
            await this.deps.onMatchFinished(existing.id)
          }
        }
      } catch (err) {
        console.error(`[SyncLiveScores] Error syncing ${comp.name}:`, err)
      }
    }

    if (this.deps.onAllMatchesChecked) {
      await this.deps
        .onAllMatchesChecked()
        .catch((err) => console.error('[SyncLiveScores] onAllMatchesChecked failed:', err))
    }
  }
}
