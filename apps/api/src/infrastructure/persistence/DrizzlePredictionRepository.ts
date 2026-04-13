import { and, asc, eq, sql } from 'drizzle-orm'
import type { db as dbClient } from '../../db/client'
import { user } from '../../db/schema/auth'
import { prediction } from '../../db/schema/prediction'
import type { Prediction } from '../../domain/prediction/Prediction'
import type {
  PredictionRepository,
  PredictionWithMatch,
  PredictionWithUser,
} from '../../domain/prediction/PredictionRepository.port'
import { predictionToDomain, predictionToPersistence } from './mappers/PredictionMapper'

export class DrizzlePredictionRepository implements PredictionRepository {
  constructor(private readonly db: typeof dbClient) {}

  async findByUserPoolMatch(
    userId: string,
    poolId: string,
    matchId: string,
  ): Promise<Prediction | null> {
    const row = await this.db.query.prediction.findFirst({
      where: and(
        eq(prediction.userId, userId),
        eq(prediction.poolId, poolId),
        eq(prediction.matchId, matchId),
      ),
    })
    if (!row) return null
    return predictionToDomain(row)
  }

  async findByUserPool(userId: string, poolId: string): Promise<PredictionWithMatch[]> {
    const rows = await this.db.query.prediction.findMany({
      where: and(eq(prediction.userId, userId), eq(prediction.poolId, poolId)),
      with: { match: true },
    })

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      poolId: r.poolId,
      matchId: r.matchId,
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      points: r.points,
      match: {
        id: r.match.id,
        competitionId: r.match.competitionId,
        matchday: r.match.matchday,
        matchDate: r.match.matchDate,
        homeTeam: r.match.homeTeam,
        awayTeam: r.match.awayTeam,
        homeScore: r.match.homeScore,
        awayScore: r.match.awayScore,
        status: r.match.status,
        stage: r.match.stage,
        group: r.match.group,
        homeFlag: r.match.homeFlag ?? '',
        awayFlag: r.match.awayFlag ?? '',
      },
    }))
  }

  async findByPoolMatch(poolId: string, matchId: string): Promise<PredictionWithUser[]> {
    const rows = await this.db
      .select({
        userId: prediction.userId,
        name: user.name,
        homeScore: prediction.homeScore,
        awayScore: prediction.awayScore,
        points: prediction.points,
      })
      .from(prediction)
      .innerJoin(user, eq(user.id, prediction.userId))
      .where(and(eq(prediction.poolId, poolId), eq(prediction.matchId, matchId)))
      .orderBy(sql`${prediction.points} desc nulls last`, asc(user.name))

    return rows.map((r) => ({
      userId: r.userId,
      name: r.name ?? '',
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      points: r.points,
    }))
  }

  async save(entity: Prediction): Promise<Prediction> {
    if (entity.id) {
      const [updated] = await this.db
        .update(prediction)
        .set({
          homeScore: entity.homeScore,
          awayScore: entity.awayScore,
          points: entity.points,
          updatedAt: new Date(),
        })
        .where(eq(prediction.id, entity.id))
        .returning()
      return predictionToDomain(updated as NonNullable<typeof updated>)
    }

    const data = predictionToPersistence(entity)
    const [created] = await this.db.insert(prediction).values(data).returning()
    return predictionToDomain(created as NonNullable<typeof created>)
  }

  async updatePoints(id: string, points: number): Promise<void> {
    await this.db
      .update(prediction)
      .set({ points, updatedAt: new Date() })
      .where(eq(prediction.id, id))
  }

  async findByMatch(matchId: string): Promise<Prediction[]> {
    const rows = await this.db.query.prediction.findMany({
      where: eq(prediction.matchId, matchId),
    })
    return rows.map(predictionToDomain)
  }
}
