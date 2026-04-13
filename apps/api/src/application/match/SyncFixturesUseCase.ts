import type { MatchRepository, UpsertMatchData } from '../../domain/match/MatchRepository.port'
import {
  extractGroup,
  mapStage,
  mapStatus,
} from '../../infrastructure/persistence/mappers/MatchMapper'
import type { ExternalMatch, FootballDataApi } from '../ports/FootballDataApi.port'

export type CompetitionInfo = {
  id: string
  externalId: string
  season: string
  type: string
  name: string
}

export type SyncFixturesDeps = {
  footballApi: FootballDataApi
  matchRepo: MatchRepository
  findActiveCompetitions: () => Promise<CompetitionInfo[]>
  onMatchFinished?: (matchId: string) => Promise<void>
}

export class SyncFixturesUseCase {
  constructor(private readonly deps: SyncFixturesDeps) {}

  async execute(): Promise<void> {
    const competitions = await this.deps.findActiveCompetitions()

    if (competitions.length === 0) {
      console.log('[SyncFixtures] No active competitions, skipping')
      return
    }

    for (const comp of competitions) {
      try {
        const externalMatches = await this.deps.footballApi.fetchMatches(
          comp.externalId,
          comp.season,
        )
        await this.upsertMatches(externalMatches, comp)
        console.log(`[SyncFixtures] Synced ${externalMatches.length} fixtures for ${comp.name}`)
      } catch (err) {
        console.error(`[SyncFixtures] Error syncing ${comp.name}:`, err)
      }
    }
  }

  private async upsertMatches(
    externalMatches: ExternalMatch[],
    comp: CompetitionInfo,
  ): Promise<void> {
    const matchesToUpsert: UpsertMatchData[] = externalMatches.map((m) =>
      this.toUpsertData(m, comp),
    )

    const existingByExtId = new Map<string, { id: string; status: string }>()
    const existing = await this.deps.matchRepo.findByCompetition(comp.id)
    for (const e of existing) {
      existingByExtId.set(e.externalId, { id: e.id, status: e.status })
    }

    const upserted = await this.deps.matchRepo.upsertMany(matchesToUpsert)

    if (this.deps.onMatchFinished) {
      for (const match of upserted) {
        const prev = existingByExtId.get(match.externalId)
        if (prev && prev.status !== 'finished' && match.status === 'finished') {
          console.log(`[SyncFixtures] Match ${match.id} finished, triggering points calc...`)
          await this.deps.onMatchFinished(match.id)
        }
      }
    }
  }

  private toUpsertData(m: ExternalMatch, comp: CompetitionInfo): UpsertMatchData {
    const stage = comp.type === 'league' ? 'league' : mapStage(m.stage, comp.type)
    return {
      externalId: String(m.id),
      competitionId: comp.id,
      homeTeam: m.homeTeam.name || 'TBD',
      awayTeam: m.awayTeam.name || 'TBD',
      homeFlag: m.homeTeam.crest || '',
      awayFlag: m.awayTeam.crest || '',
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
      stage,
      group: extractGroup(m.group),
      matchday: m.matchday,
      matchDate: new Date(m.utcDate),
      status: mapStatus(m.status),
    }
  }
}
