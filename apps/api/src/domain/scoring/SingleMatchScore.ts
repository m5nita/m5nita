import { SCORING } from '@m5nita/shared'

const BONUS_CAP = 4

export type SingleMatchScoreBreakdown = {
  category: number
  bonus: number
  distance: number
  total: number
}

export function calculateSingleMatchScore(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): SingleMatchScoreBreakdown {
  const category = categoryPoints(predictedHome, predictedAway, actualHome, actualAway)
  const distance = computeDistance(predictedHome, predictedAway, actualHome, actualAway)
  const bonus = Math.max(0, BONUS_CAP - distance)
  return { category, bonus, distance, total: category + bonus }
}

export const SingleMatchScore = {
  calculate: calculateSingleMatchScore,
}

function categoryPoints(pH: number, pA: number, rH: number, rA: number): number {
  if (pH === rH && pA === rA) return SCORING.EXACT_MATCH
  const pDiff = pH - pA
  const rDiff = rH - rA
  if (pDiff === rDiff && pDiff !== 0) return SCORING.WINNER_AND_DIFF
  if (Math.sign(pDiff) === Math.sign(rDiff)) return SCORING.OUTCOME_CORRECT
  return SCORING.MISS
}

function computeDistance(pH: number, pA: number, rH: number, rA: number): number {
  const pSign = Math.sign(pH - pA)
  const rSign = Math.sign(rH - rA)
  const inverted = pSign !== 0 && rSign !== 0 && pSign !== rSign
  if (!inverted) return Math.abs(pH - rH) + Math.abs(pA - rA)
  // real home wins, pred away wins
  if (rSign > 0) return Math.abs(pH - rH) + (pA + rA)
  // real away wins, pred home wins
  return pH + rH + Math.abs(pA - rA)
}
