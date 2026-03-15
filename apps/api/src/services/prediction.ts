import { eq, and, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { prediction } from '../db/schema/prediction'
import { match } from '../db/schema/match'
import { poolMember } from '../db/schema/poolMember'

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
  // Verify membership
  const member = await db.query.poolMember.findFirst({
    where: and(eq(poolMember.poolId, poolId), eq(poolMember.userId, userId)),
  })
  if (!member) {
    throw new PredictionError('NOT_MEMBER', 'Voce nao e membro deste bolao')
  }

  // Verify match exists and hasn't started
  const matchData = await db.query.match.findFirst({
    where: eq(match.id, matchId),
  })
  if (!matchData) {
    throw new PredictionError('MATCH_NOT_FOUND', 'Jogo nao encontrado')
  }
  if (new Date(matchData.matchDate) <= new Date()) {
    throw new PredictionError('MATCH_STARTED', 'Nao e possivel palpitar apos o inicio do jogo')
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
    return updated!
  }

  const [created] = await db
    .insert(prediction)
    .values({ userId, poolId, matchId, homeScore, awayScore })
    .returning()
  return created!
}

export async function getUserPredictions(userId: string, poolId: string) {
  return db.query.prediction.findMany({
    where: and(eq(prediction.userId, userId), eq(prediction.poolId, poolId)),
    with: { match: true },
  })
}
