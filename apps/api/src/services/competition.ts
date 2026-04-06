import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { competition } from '../db/schema/competition'
import { match } from '../db/schema/match'

export class CompetitionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'CompetitionError'
  }
}

export async function createCompetition(
  externalId: string,
  name: string,
  season: string,
  type: string,
) {
  if (type !== 'cup' && type !== 'league') {
    throw new CompetitionError('VALIDATION_ERROR', 'Tipo deve ser "cup" ou "league"')
  }

  const existing = await db.query.competition.findFirst({
    where: and(eq(competition.externalId, externalId), eq(competition.season, season)),
  })

  if (existing) {
    throw new CompetitionError('ALREADY_EXISTS', 'Competição já cadastrada para esta temporada')
  }

  const [created] = await db
    .insert(competition)
    .values({
      externalId,
      name,
      season,
      type,
      status: 'active',
    })
    .returning()

  return created as NonNullable<typeof created>
}

export async function listCompetitions() {
  return db.query.competition.findMany({
    orderBy: (competition, { desc }) => [desc(competition.createdAt)],
  })
}

export async function getActiveCompetitions() {
  const activeComps = await db
    .select({
      id: competition.id,
      externalId: competition.externalId,
      name: competition.name,
      season: competition.season,
      type: competition.type,
      status: competition.status,
      featured: competition.featured,
      createdAt: competition.createdAt,
      updatedAt: competition.updatedAt,
      matchCount: sql<number>`count(${match.id})::int`,
      upcomingMatchCount: sql<number>`count(case when ${match.status} = 'scheduled' then 1 end)::int`,
      minMatchday: sql<number | null>`min(${match.matchday})`,
      maxMatchday: sql<number | null>`max(${match.matchday})`,
      nextMatchday: sql<
        number | null
      >`min(case when ${match.status} = 'scheduled' then ${match.matchday} end)`,
      firstMatchYear: sql<number | null>`extract(year from min(${match.matchDate}))::int`,
      lastMatchYear: sql<number | null>`extract(year from max(${match.matchDate}))::int`,
    })
    .from(competition)
    .leftJoin(match, eq(match.competitionId, competition.id))
    .where(eq(competition.status, 'active'))
    .groupBy(competition.id)
    .having(sql`count(case when ${match.status} = 'scheduled' then 1 end) > 0`)

  return activeComps.map((comp) => {
    const seasonDisplay =
      comp.firstMatchYear && comp.lastMatchYear && comp.firstMatchYear !== comp.lastMatchYear
        ? `${comp.firstMatchYear}/${comp.lastMatchYear}`
        : comp.season

    const base = {
      id: comp.id,
      externalId: comp.externalId,
      name: comp.name,
      season: comp.season,
      seasonDisplay,
      type: comp.type,
      status: comp.status,
      featured: comp.featured,
      createdAt: comp.createdAt,
      updatedAt: comp.updatedAt,
      matchCount: comp.matchCount,
      upcomingMatchCount: comp.upcomingMatchCount,
    }

    if (comp.type === 'league') {
      return {
        ...base,
        matchdays: {
          min: comp.minMatchday,
          max: comp.maxMatchday,
          nextMatchday: comp.nextMatchday,
        },
      }
    }

    return base
  })
}

export async function deactivateCompetition(externalId: string, season: string) {
  const [updated] = await db
    .update(competition)
    .set({ status: 'finished', updatedAt: new Date() })
    .where(and(eq(competition.externalId, externalId), eq(competition.season, season)))
    .returning()

  if (!updated) {
    throw new CompetitionError('NOT_FOUND', 'Competição não encontrada')
  }

  return updated
}

export async function getCompetitionById(id: string) {
  const result = await db.query.competition.findFirst({
    where: eq(competition.id, id),
  })

  return result ?? null
}

export async function toggleFeatured(externalId: string, season: string) {
  const existing = await db.query.competition.findFirst({
    where: and(eq(competition.externalId, externalId), eq(competition.season, season)),
  })

  if (!existing) {
    throw new CompetitionError('NOT_FOUND', 'Competição não encontrada')
  }

  const [updated] = await db
    .update(competition)
    .set({ featured: !existing.featured, updatedAt: new Date() })
    .where(eq(competition.id, existing.id))
    .returning()

  return updated as NonNullable<typeof updated>
}

export async function getFeaturedCompetitionIds(): Promise<string[]> {
  const featured = await db.query.competition.findMany({
    where: and(eq(competition.status, 'active'), eq(competition.featured, true)),
    columns: { id: true },
  })
  return featured.map((c) => c.id)
}
