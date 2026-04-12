import { Prediction } from '../../../domain/prediction/Prediction'

export type PredictionRow = {
  id: string
  userId: string
  poolId: string
  matchId: string
  homeScore: number
  awayScore: number
  points: number | null
  createdAt: Date
  updatedAt: Date
}

export function predictionToDomain(row: PredictionRow): Prediction {
  return new Prediction(
    row.id,
    row.userId,
    row.poolId,
    row.matchId,
    row.homeScore,
    row.awayScore,
    row.points,
  )
}

export function predictionToPersistence(entity: Prediction): PredictionRow {
  return {
    id: entity.id ?? crypto.randomUUID(),
    userId: entity.userId,
    poolId: entity.poolId,
    matchId: entity.matchId,
    homeScore: entity.homeScore,
    awayScore: entity.awayScore,
    points: entity.points,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
