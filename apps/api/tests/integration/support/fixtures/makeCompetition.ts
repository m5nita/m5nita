import type postgres from 'postgres'

export type TestCompetition = {
  id: string
  externalId: string
  name: string
  season: string
  type: string
}

export async function makeCompetition(
  sql: ReturnType<typeof postgres>,
  overrides: Partial<TestCompetition> = {},
): Promise<TestCompetition> {
  const id = overrides.id ?? crypto.randomUUID()
  const name = overrides.name ?? 'FIFA World Cup 2026'
  const season = overrides.season ?? '2026'
  const externalId = overrides.externalId ?? `test-comp-${crypto.randomUUID().slice(0, 8)}`
  const type = overrides.type ?? 'world_cup'

  await sql`
    INSERT INTO "competition" (id, external_id, name, season, type, status, featured)
    VALUES (${id}, ${externalId}, ${name}, ${season}, ${type}, 'active', true)
  `

  return { id, externalId, name, season, type }
}
