import { and, eq } from 'drizzle-orm'
import { db } from '../db/client'
import { match } from '../db/schema/match'
import { pool } from '../db/schema/pool'
import { poolMember } from '../db/schema/poolMember'
import { prediction } from '../db/schema/prediction'

export class PredictionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PredictionError'
  }
}

export async function upsertPrediction(
  userId: string,
  poolId: string,
  matchId: string,
  homeScore: number,
  awayScore: number,
) {
  // Verify pool is not closed
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
  })
  if (poolData?.status === 'closed') {
    throw new PredictionError('POOL_CLOSED', 'Não é possível palpitar em um bolão finalizado')
  }

  // Verify membership
  const member = await db.query.poolMember.findFirst({
    where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
  })
  if (!member) {
    throw new PredictionError('NOT_MEMBER', 'Você não é membro deste bolão')
  }

  // Verify match exists and hasn't started
  const matchData = await db.query.match.findFirst({
    where: eq(match.id, matchId),
  })
  if (!matchData) {
    throw new PredictionError('MATCH_NOT_FOUND', 'Jogo não encontrado')
  }
  if (new Date(matchData.matchDate) <= new Date()) {
    throw new PredictionError('MATCH_STARTED', 'Não é possível palpitar após o início do jogo')
  }

  // Upsert prediction
  const existing = await db.query.prediction.findFirst({
    where: and(
      eq(prediction.userId, userId),
      eq(prediction.poolId, poolId),
      eq(prediction.matchId, matchId),
    ),
  })

  if (existing) {
    const [updated] = await db
      .update(prediction)
      .set({ homeScore, awayScore, updatedAt: new Date() })
      .where(eq(prediction.id, existing.id))
      .returning()
    return updated as NonNullable<typeof updated>
  }

  const [created] = await db
    .insert(prediction)
    .values({ userId, poolId, matchId, homeScore, awayScore })
    .returning()
  return created as NonNullable<typeof created>
}

export async function getUserPredictions(userId: string, poolId: string) {
  const poolData = await db.query.pool.findFirst({
    where: eq(pool.id, poolId),
  })

  const predictions = await db.query.prediction.findMany({
    where: and(eq(prediction.userId, userId), eq(prediction.poolId, poolId)),
    with: { match: true },
  })

  if (!poolData) return predictions

  return predictions.filter((p) => {
    if (p.match.competitionId !== poolData.competitionId) return false
    if (poolData.matchdayFrom != null && poolData.matchdayTo != null && p.match.matchday != null) {
      if (p.match.matchday < poolData.matchdayFrom || p.match.matchday > poolData.matchdayTo) {
        return false
      }
    }
    return true
  })
}
