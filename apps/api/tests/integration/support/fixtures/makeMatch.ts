import type postgres from 'postgres'

export type TestMatch = {
  id: string
  competitionId: string
  externalId: number
  homeTeam: string
  awayTeam: string
  matchDate: Date
  status: 'scheduled' | 'live' | 'finished'
  stage: string
  matchday: number
  homeScore: number | null
  awayScore: number | null
}

let externalIdSeq = 1_000_000

export async function makeMatch(
  sql: ReturnType<typeof postgres>,
  opts: {
    competitionId: string
    matchDate: Date
    homeTeam?: string
    awayTeam?: string
    stage?: string
    matchday?: number
    status?: 'scheduled' | 'live' | 'finished'
    homeScore?: number
    awayScore?: number
  },
): Promise<TestMatch> {
  const id = crypto.randomUUID()
  const externalId = ++externalIdSeq
  const homeTeam = opts.homeTeam ?? 'Home FC'
  const awayTeam = opts.awayTeam ?? 'Away FC'
  const stage = opts.stage ?? 'GROUP_STAGE'
  const matchday = opts.matchday ?? 1
  const status = opts.status ?? 'scheduled'
  const homeScore = opts.homeScore ?? null
  const awayScore = opts.awayScore ?? null

  await sql`
    INSERT INTO "match"
      (id, competition_id, external_id, home_team, away_team, match_date,
       status, stage, matchday, home_score, away_score)
    VALUES
      (${id}, ${opts.competitionId}, ${externalId}, ${homeTeam}, ${awayTeam},
       ${opts.matchDate}, ${status}, ${stage}, ${matchday},
       ${homeScore}, ${awayScore})
  `

  return {
    id,
    competitionId: opts.competitionId,
    externalId,
    homeTeam,
    awayTeam,
    matchDate: opts.matchDate,
    status,
    stage,
    matchday,
    homeScore,
    awayScore,
  }
}

export async function finishMatch(
  sql: ReturnType<typeof postgres>,
  matchId: string,
  homeScore: number,
  awayScore: number,
): Promise<void> {
  await sql`
    UPDATE "match"
    SET status = 'finished', home_score = ${homeScore}, away_score = ${awayScore},
        updated_at = NOW()
    WHERE id = ${matchId}
  `
}
