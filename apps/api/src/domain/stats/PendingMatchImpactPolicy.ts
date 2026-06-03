export type ImpactBucket = 'high' | 'medium' | 'low'

export type PendingMatchInput = {
  matchId: string
  homeTeam: string
  awayTeam: string
  matchDate: Date
  /** Whether THIS viewer already has a prediction (their own state only). */
  hasPrediction: boolean
}

export type PendingMatchImpact = {
  matchId: string
  homeTeam: string
  awayTeam: string
  kickoff: string
  hasPrediction: boolean
  action: 'submit' | 'change'
  impact: ImpactBucket
  /** Max points this match can give you (10 range / 14 single-match). */
  pointsAtStake: number
  /** Rivals close enough that this match could flip your position. */
  reachableRivals: number
}

export type ImpactContext = {
  viewerPoints: number
  /** All members' finished-match points (anonymized numbers — no predictions). */
  memberPoints: number[]
  maxPoints: number
}

/**
 * Ranks ALL of the viewer's own not-yet-started matches (predicted or not) so
 * they can submit or change before kickoff. The stakes magnitude is
 * points-at-stake (maxPoints) × reachable-rival density — a coarse high/medium/
 * low bucket; with no per-match odds it is the same for every pending match, so
 * matches are ORDERED by urgency: not-yet-predicted first (you risk zero there),
 * then earliest kickoff. O(matches + members), no outcome-combination
 * simulation, and it reads only anonymized member point totals — never a third
 * party's prediction.
 */
export const PendingMatchImpactPolicy = {
  rank(matches: PendingMatchInput[], ctx: ImpactContext): PendingMatchImpact[] {
    const { rivals, bucket } = reach(ctx)
    return [...matches]
      .sort(
        (a, b) =>
          Number(a.hasPrediction) - Number(b.hasPrediction) ||
          a.matchDate.getTime() - b.matchDate.getTime(),
      )
      .map((m) => ({
        matchId: m.matchId,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        kickoff: m.matchDate.toISOString(),
        hasPrediction: m.hasPrediction,
        action: m.hasPrediction ? 'change' : 'submit',
        impact: bucket,
        pointsAtStake: ctx.maxPoints,
        reachableRivals: rivals,
      }))
  },
}

function reach(ctx: ImpactContext): { rivals: number; bucket: ImpactBucket } {
  // Rivals within one match's worth of points of the viewer (the reachable
  // band), excluding the viewer themselves — these are who a result can flip.
  const within = ctx.memberPoints.filter(
    (p) => Math.abs(p - ctx.viewerPoints) <= ctx.maxPoints,
  ).length
  const rivals = Math.max(0, within - 1)
  const denom = Math.max(1, ctx.memberPoints.length - 1)
  const density = rivals / denom
  const bucket: ImpactBucket = density >= 0.5 ? 'high' : density >= 0.2 ? 'medium' : 'low'
  return { rivals, bucket }
}
