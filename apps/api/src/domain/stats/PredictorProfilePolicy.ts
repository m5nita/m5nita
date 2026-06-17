import { STATS } from '@m5nita/shared'
import type { ProfileFactRow } from './StatsRepository.port'

export type DimensionStat = { correct: number; total: number; pct: number }

/** You bet draws far less often than they actually happen — the unmissed point. */
export type DrawBlindnessCard = {
  yourRate: number
  realRate: number
  yourCount: number
  realCount: number
}

/** Predictions one goal away from the exact score, and the points that would add. */
export type NearMissCard = { count: number; points: number }

export type SignatureScoreline = { home: number; away: number; sharePct: number }

/** Whether you inflate scorelines and lean on one signature scoreline. */
export type GoalCalibrationCard = {
  yourAvg: number
  realAvg: number
  lean: 'inflate' | 'economize' | 'calibrated'
  signature: SignatureScoreline | null
}

/** Accuracy in low- vs high-scoring games, with the clearly stronger side. */
export type GoalTypeCard = {
  low: DimensionStat
  high: DimensionStat
  betterAt: 'low' | 'high' | null
}

export type PredictorProfileBlock = {
  drawBlindness: DrawBlindnessCard | null
  nearMiss: NearMissCard | null
  goalCalibration: GoalCalibrationCard | null
  goalType: GoalTypeCard | null
  state: 'ok' | 'insufficient_data'
}

// v1 thresholds (tunable). A card only surfaces once it has enough signal AND
// something actionable to say — otherwise it is omitted, not shown empty.
const DRAW_MIN_FINISHED = 8
const DRAW_MARGIN = 0.1
const CALIB_MIN_FINISHED = 6
const CALIB_MARGIN = 0.4
const SIGNATURE_MIN_SHARE = 0.25
const GOALTYPE_MIN_FINISHED = 4
const GOALTYPE_MIN_SAMPLES = 3
const GOALTYPE_MARGIN = 0.15

/**
 * Turns the viewer's own finished predictions into a coaching profile, comparing
 * them to what actually happened in those same matches (never to other members).
 * Pure: outcome classification is sign-based, near-miss recoverable points use
 * the pool's max-per-match passed in — no scoring rule is re-derived here.
 */
export const PredictorProfilePolicy = {
  build(facts: ProfileFactRow[], maxPoints: number): PredictorProfileBlock {
    const drawBlindness = buildDrawBlindness(facts)
    const nearMiss = buildNearMiss(facts, maxPoints)
    const goalCalibration = buildCalibration(facts)
    const goalType = buildGoalType(facts)
    const any = drawBlindness || nearMiss || goalCalibration || goalType
    return {
      drawBlindness,
      nearMiss,
      goalCalibration,
      goalType,
      state: any ? 'ok' : 'insufficient_data',
    }
  },
}

function isDraw(home: number, away: number): boolean {
  return home === away
}

function isExact(f: ProfileFactRow): boolean {
  return f.predHome === f.actualHome && f.predAway === f.actualAway
}

function resultCorrect(f: ProfileFactRow): boolean {
  return Math.sign(f.predHome - f.predAway) === Math.sign(f.actualHome - f.actualAway)
}

function buildDrawBlindness(facts: ProfileFactRow[]): DrawBlindnessCard | null {
  const n = facts.length
  if (n < DRAW_MIN_FINISHED) return null
  const yourCount = facts.filter((f) => isDraw(f.predHome, f.predAway)).length
  const realCount = facts.filter((f) => isDraw(f.actualHome, f.actualAway)).length
  const yourRate = yourCount / n
  const realRate = realCount / n
  if (realRate - yourRate < DRAW_MARGIN) return null
  return { yourRate, realRate, yourCount, realCount }
}

function buildNearMiss(facts: ProfileFactRow[], maxPoints: number): NearMissCard | null {
  const near = facts.filter(
    (f) =>
      !isExact(f) &&
      Math.abs(f.predHome - f.actualHome) + Math.abs(f.predAway - f.actualAway) === 1,
  )
  if (near.length === 0) return null
  const points = near.reduce((sum, f) => sum + Math.max(0, maxPoints - f.points), 0)
  return { count: near.length, points }
}

function buildCalibration(facts: ProfileFactRow[]): GoalCalibrationCard | null {
  const n = facts.length
  if (n < CALIB_MIN_FINISHED) return null
  const yourAvg = facts.reduce((s, f) => s + f.predHome + f.predAway, 0) / n
  const realAvg = facts.reduce((s, f) => s + f.actualHome + f.actualAway, 0) / n
  const diff = yourAvg - realAvg
  const lean = diff >= CALIB_MARGIN ? 'inflate' : diff <= -CALIB_MARGIN ? 'economize' : 'calibrated'
  return { yourAvg, realAvg, lean, signature: signatureOf(facts) }
}

function signatureOf(facts: ProfileFactRow[]): SignatureScoreline | null {
  const counts = new Map<string, number>()
  for (const f of facts) {
    const key = `${f.predHome}-${f.predAway}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bestKey = ''
  let best = 0
  for (const [key, count] of counts) {
    if (count > best) {
      best = count
      bestKey = key
    }
  }
  const sharePct = best / facts.length
  if (sharePct < SIGNATURE_MIN_SHARE) return null
  const [home, away] = bestKey.split('-').map(Number)
  return { home, away, sharePct }
}

function buildGoalType(facts: ProfileFactRow[]): GoalTypeCard | null {
  if (facts.length < GOALTYPE_MIN_FINISHED) return null
  const low = dimension(facts.filter((f) => f.actualHome + f.actualAway <= STATS.LOW_GOALS_MAX))
  const high = dimension(facts.filter((f) => f.actualHome + f.actualAway > STATS.LOW_GOALS_MAX))
  return { low, high, betterAt: betterSide(low, high) }
}

function dimension(rows: ProfileFactRow[]): DimensionStat {
  const correct = rows.filter(resultCorrect).length
  const total = rows.length
  return { correct, total, pct: total > 0 ? correct / total : 0 }
}

function betterSide(low: DimensionStat, high: DimensionStat): 'low' | 'high' | null {
  if (low.total < GOALTYPE_MIN_SAMPLES || high.total < GOALTYPE_MIN_SAMPLES) return null
  const diff = low.pct - high.pct
  if (diff >= GOALTYPE_MARGIN) return 'low'
  if (-diff >= GOALTYPE_MARGIN) return 'high'
  return null
}
