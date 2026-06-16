import { and, asc, eq, gt, gte, inArray, lte, notInArray } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { match } from '../../db/schema/match'
import type {
  MatchData,
  MatchFilters,
  MatchRepository,
  MatchResultUpdate,
  UpsertMatchData,
} from '../../domain/match/MatchRepository.port'
import { MatchStatus } from '../../domain/match/MatchStatus'
import type { UnfinishedMatchesQuery } from '../../domain/pool/Pool'

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
    extraTimeHomeScore: row.extraTimeHomeScore,
    extraTimeAwayScore: row.extraTimeAwayScore,
    penaltyHomeScore: row.penaltyHomeScore,
    penaltyAwayScore: row.penaltyAwayScore,
    winner: row.winner,
    duration: row.duration,
    stage: row.stage,
    group: row.group,
    matchday: row.matchday,
    matchDate: row.matchDate,
    status: row.status,
  }
}

function knockoutColumns(m: UpsertMatchData) {
  return {
    extraTimeHomeScore: m.extraTimeHomeScore,
    extraTimeAwayScore: m.extraTimeAwayScore,
    penaltyHomeScore: m.penaltyHomeScore,
    penaltyAwayScore: m.penaltyAwayScore,
    winner: m.winner,
    duration: m.duration,
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

  async findUpcomingByCompetition(competitionId: string, now: Date): Promise<MatchData[]> {
    const rows = await this.db
      .select()
      .from(match)
      .where(
        and(
          eq(match.competitionId, competitionId),
          gt(match.matchDate, now),
          inArray(match.status, ['scheduled', 'timed', 'postponed']),
        ),
      )
      .orderBy(asc(match.matchDate), asc(match.id))
    return rows.map(toMatchData)
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
            ...knockoutColumns(m),
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
            ...knockoutColumns(m),
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

  async updateScores(id: string, result: MatchResultUpdate): Promise<void> {
    await this.db
      .update(match)
      .set({
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        status: result.status,
        winner: result.winner ?? null,
        duration: result.duration ?? null,
        extraTimeHomeScore: result.extraTimeHomeScore ?? null,
        extraTimeAwayScore: result.extraTimeAwayScore ?? null,
        penaltyHomeScore: result.penaltyHomeScore ?? null,
        penaltyAwayScore: result.penaltyAwayScore ?? null,
        minute: result.minute ?? null,
        injuryTime: result.injuryTime ?? null,
        updatedAt: new Date(),
      })
      .where(eq(match.id, id))
  }

  async hasUnfinishedMatches(
    competitionId: string,
    matchdayFrom?: number | null,
    matchdayTo?: number | null,
  ): Promise<boolean> {
    // Cancelled counts as terminal alongside finished: a pool whose remaining
    // matches are cancelled must still be closable, otherwise its prize is stuck.
    const conditions = [
      eq(match.competitionId, competitionId),
      notInArray(match.status, [...MatchStatus.TERMINAL_VALUES]),
    ]

    if (matchdayFrom != null) {
      conditions.push(gte(match.matchday, matchdayFrom))
    }
    if (matchdayTo != null) {
      conditions.push(lte(match.matchday, matchdayTo))
    }

    const [row] = await this.db
      .select({ id: match.id })
      .from(match)
      .where(and(...conditions))
      .limit(1)

    return !!row
  }

  async hasUnfinishedFor(query: UnfinishedMatchesQuery): Promise<boolean> {
    if (query.kind === 'single-match') {
      const m = await this.findById(query.matchId)
      return m === null || !MatchStatus.from(m.status).isTerminal()
    }
    return this.hasUnfinishedMatches(query.competitionId, query.matchdayFrom, query.matchdayTo)
  }

  async findPendingFor(query: UnfinishedMatchesQuery, now: Date): Promise<MatchData[]> {
    // Not-yet-started = kickoff in the future and still playable (same signal as
    // findUpcomingByCompetition). Scope translation lives here, not in callers.
    const notStarted = inArray(match.status, ['scheduled', 'timed', 'postponed'])

    if (query.kind === 'single-match') {
      const rows = await this.db
        .select()
        .from(match)
        .where(and(eq(match.id, query.matchId), gt(match.matchDate, now), notStarted))
      return rows.map(toMatchData)
    }

    const conditions = [
      eq(match.competitionId, query.competitionId),
      gt(match.matchDate, now),
      notStarted,
    ]
    if (query.matchdayFrom != null) conditions.push(gte(match.matchday, query.matchdayFrom))
    if (query.matchdayTo != null) conditions.push(lte(match.matchday, query.matchdayTo))

    const rows = await this.db
      .select()
      .from(match)
      .where(and(...conditions))
      .orderBy(asc(match.matchDate), asc(match.id))
    return rows.map(toMatchData)
  }
}
