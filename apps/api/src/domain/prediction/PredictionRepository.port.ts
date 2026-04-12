import type { Prediction } from './Prediction'

export type PredictionWithMatch = {
  id: string | null
  userId: string
  poolId: string
  matchId: string
  homeScore: number
  awayScore: number
  points: number | null
  match: {
    id: string
    competitionId: string
    matchday: number | null
    matchDate: Date
    homeTeam: string
    awayTeam: string
    homeScore: number | null
    awayScore: number | null
    status: string
    stage: string
    group: string | null
    homeFlag: string
    awayFlag: string
  }
}

export type PredictionWithUser = {
  userId: string
  name: string
  homeScore: number
  awayScore: number
  points: number | null
}

export interface PredictionRepository {
  findByUserPoolMatch(userId: string, poolId: string, matchId: string): Promise<Prediction | null>
  findByUserPool(userId: string, poolId: string): Promise<PredictionWithMatch[]>
  findByPoolMatch(poolId: string, matchId: string): Promise<PredictionWithUser[]>
  save(prediction: Prediction): Promise<Prediction>
  updatePoints(id: string, points: number): Promise<void>
  findByMatch(matchId: string): Promise<Prediction[]>
}
