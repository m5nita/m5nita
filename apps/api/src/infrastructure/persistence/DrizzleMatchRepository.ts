import { and, eq } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { match } from '../../db/schema/match'
import type {
  MatchData,
  MatchFilters,
  MatchRepository,
  UpsertMatchData,
} from '../../domain/match/MatchRepository.port'

type MatchRow = typeof match.$inferSelect

function toMatchData(row: MatchRow): MatchData {
  return {
    id: row.id,
    externalId: String(row.externalId),
    competitionId: row.competitionId,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    homeFlag: row.homeFlag ?? '',
    awayFlag: row.awayFlag ?? '',
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    stage: row.stage,
    group: row.group,
    matchday: row.matchday,
    matchDate: row.matchDate,
    status: row.status,
  }
}

export class DrizzleMatchRepository implements MatchRepository {
  constructor(private readonly db: typeof dbClient) {}

  async findById(id: string): Promise<MatchData | null> {
    const row = await this.db.query.match.findFirst({
      where: eq(match.id, id),
    })
    if (!row) return null
    return toMatchData(row)
  }

  async findByCompetition(competitionId: string, filters?: MatchFilters): Promise<MatchData[]> {
    const conditions = [eq(match.competitionId, competitionId)]

    if (filters?.status) {
      conditions.push(eq(match.status, filters.status))
    }
    if (filters?.stage) {
      conditions.push(eq(match.stage, filters.stage))
    }
    if (filters?.group) {
      conditions.push(eq(match.group, filters.group))
    }
    if (filters?.matchday !== undefined) {
      conditions.push(eq(match.matchday, filters.matchday))
    }

    const rows = await this.db.query.match.findMany({
      where: and(...conditions),
    })

    return rows.map(toMatchData)
  }

  async findLive(): Promise<MatchData[]> {
    const rows = await this.db.query.match.findMany({
      where: eq(match.status, 'live'),
    })
    return rows.map(toMatchData)
  }

  async upsertMany(matches: UpsertMatchData[]): Promise<MatchData[]> {
    const results: MatchData[] = []

    for (const m of matches) {
      const existing = await this.db.query.match.findFirst({
        where: eq(match.externalId, Number(m.externalId)),
      })

      if (existing) {
        const [updated] = await this.db
          .update(match)
          .set({
            competitionId: m.competitionId,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            homeFlag: m.homeFlag,
            awayFlag: m.awayFlag,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            stage: m.stage,
            group: m.group,
            matchday: m.matchday,
            matchDate: m.matchDate,
            status: m.status,
            updatedAt: new Date(),
          })
          .where(eq(match.id, existing.id))
          .returning()
        results.push(toMatchData(updated as NonNullable<typeof updated>))
      } else {
        const [created] = await this.db
          .insert(match)
          .values({
            competitionId: m.competitionId,
            externalId: Number(m.externalId),
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            homeFlag: m.homeFlag,
            awayFlag: m.awayFlag,
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            stage: m.stage,
            group: m.group,
            matchday: m.matchday,
            matchDate: m.matchDate,
            status: m.status,
          })
          .returning()
        results.push(toMatchData(created as NonNullable<typeof created>))
      }
    }

    return results
  }

  async updateScores(
    id: string,
    homeScore: number,
    awayScore: number,
    status: string,
  ): Promise<void> {
    await this.db
      .update(match)
      .set({ homeScore, awayScore, status, updatedAt: new Date() })
      .where(eq(match.id, id))
  }
}
