import { Score } from '../scoring/Score'
import type { ScoringPolicy } from '../scoring/ScoringPolicy'
import { type PoolComparison, StatsComparisonPolicy } from './StatsComparisonPolicy'
import type {
  FormSampleRow,
  ParticipantStatsRow,
  PoolRoundPointsRow,
  PoolStatsAggregateRow,
} from './StatsRepository.port'

export type BlockState = 'ok' | 'insufficient_data'
export type Trend = 'rising' | 'falling' | 'stable'
export type FormOutcome = 'exact' | 'result' | 'miss'

export type RankingHeroBlock = {
  position: number | null
  memberCount: number
  gapToLeader: number
  trend: Trend
  state: BlockState
}

export type HitRateBlock = {
  exactPct: { you: number; average: number; leader: number }
  resultPct: { you: number; average: number; leader: number }
  state: BlockState
}

export type EfficiencyBlock = {
  earned: number
  maxPossible: number
  leftOnTable: number
  efficiency: number
  efficiencyVsAverage: number
  state: BlockState
}

export type DistributionBlock = {
  exact: number
  resultOnly: number
  miss: number
  total: number
  state: BlockState
}

export type EvolutionBlock = {
  rounds: number[]
  you: number[]
  leader: number[]
  average: number[]
  state: BlockState
}

export type RecentFormBlock = {
  outcomes: FormOutcome[]
  currentStreak: number
  state: BlockState
}

export type DimensionStat = { correct: number; total: number; pct: number }

export type StrengthsBlock = {
  lowGoals: DimensionStat
  highGoals: DimensionStat
  betterAt: 'low' | 'high' | null
  state: BlockState
}

export type StatsBlocks = {
  ranking: RankingHeroBlock
  hitRate: HitRateBlock
  efficiency: EfficiencyBlock
  distribution: DistributionBlock
  evolution: EvolutionBlock
  recentForm: RecentFormBlock
  strengths: StrengthsBlock
}

export type BuildInput = {
  viewerUserId: string
  viewer: ParticipantStatsRow
  aggregate: PoolStatsAggregateRow[]
  poolRounds: PoolRoundPointsRow[]
  recentForm: FormSampleRow[]
  scoringPolicy: ScoringPolicy
}

// A dimension needs at least this many finished samples on BOTH sides before we
// claim a tendency, and the gap must clear MARGIN to surface the takeaway.
const MIN_SAMPLES = 3
const MARGIN = 0.15

/**
 * Builds every panel block from the viewer's raw finished-match counts, the
 * anonymized pool aggregate, the pool-wide per-round series, and the viewer's
 * recent finished predictions. Pure: it does not touch the DB and never
 * re-derives scoring beyond classifying form via `Score`. Max points per match
 * come from the pool's scoring policy (10 range / 14 single-match).
 */
export const ParticipantPoolStats = {
  build(input: BuildInput): StatsBlocks {
    const { viewerUserId, viewer, aggregate, poolRounds, recentForm, scoringPolicy } = input
    const maxPoints = scoringPolicy.maxPoints()
    const comparison = StatsComparisonPolicy.compute(aggregate, maxPoints)

    return {
      ranking: buildRanking(viewer, aggregate.length, comparison),
      hitRate: buildHitRate(viewer, comparison),
      efficiency: buildEfficiency(viewer, comparison, maxPoints),
      distribution: buildDistribution(viewer),
      evolution: buildEvolution(viewerUserId, viewer, poolRounds, comparison),
      recentForm: buildRecentForm(viewer, recentForm),
      strengths: buildStrengths(viewer),
    }
  },
}

function ratio(correct: number, total: number): number {
  return total > 0 ? correct / total : 0
}

function stateFor(total: number): BlockState {
  return total > 0 ? 'ok' : 'insufficient_data'
}

function trendOf(position: number | null, prev: number | null): Trend {
  if (position == null || prev == null) return 'stable'
  if (position < prev) return 'rising'
  if (position > prev) return 'falling'
  return 'stable'
}

function buildRanking(
  viewer: ParticipantStatsRow,
  memberCount: number,
  c: PoolComparison,
): RankingHeroBlock {
  return {
    position: viewer.position,
    memberCount,
    gapToLeader: Math.max(0, c.leaderPoints - viewer.pointsTotal),
    trend: trendOf(viewer.position, viewer.prevPosition),
    state: viewer.position != null ? 'ok' : 'insufficient_data',
  }
}

function buildHitRate(viewer: ParticipantStatsRow, c: PoolComparison): HitRateBlock {
  return {
    exactPct: {
      you: ratio(viewer.exactCount, viewer.finishedCount),
      average: c.exactPct.average,
      leader: c.exactPct.leader,
    },
    resultPct: {
      you: ratio(viewer.resultCount, viewer.finishedCount),
      average: c.resultPct.average,
      leader: c.resultPct.leader,
    },
    state: stateFor(viewer.finishedCount),
  }
}

function buildEfficiency(
  viewer: ParticipantStatsRow,
  c: PoolComparison,
  maxPoints: number,
): EfficiencyBlock {
  const maxPossible = viewer.finishedCount * maxPoints
  const efficiency = maxPossible > 0 ? viewer.pointsTotal / maxPossible : 0
  return {
    earned: viewer.pointsTotal,
    maxPossible,
    leftOnTable: Math.max(0, maxPossible - viewer.pointsTotal),
    efficiency,
    efficiencyVsAverage: efficiency - c.efficiency.average,
    state: stateFor(viewer.finishedCount),
  }
}

// exact ⊆ result (an exact score also gets the result right), so the three
// slices partition the finished predictions.
function buildDistribution(viewer: ParticipantStatsRow): DistributionBlock {
  return {
    exact: viewer.exactCount,
    resultOnly: Math.max(0, viewer.resultCount - viewer.exactCount),
    miss: Math.max(0, viewer.finishedCount - viewer.resultCount),
    total: viewer.finishedCount,
    state: stateFor(viewer.finishedCount),
  }
}

function buildEvolution(
  viewerUserId: string,
  viewer: ParticipantStatsRow,
  poolRounds: PoolRoundPointsRow[],
  c: PoolComparison,
): EvolutionBlock {
  const rounds = [...new Set(poolRounds.map((r) => r.matchday))].sort((a, b) => a - b)
  const byUser = new Map<string, Map<number, number>>()
  for (const r of poolRounds) {
    const m = byUser.get(r.userId) ?? new Map<number, number>()
    m.set(r.matchday, r.points)
    byUser.set(r.userId, m)
  }

  const cumulativeFor = (userId: string | null): number[] => {
    const m = userId ? byUser.get(userId) : undefined
    let acc = 0
    return rounds.map((md) => {
      acc += m?.get(md) ?? 0
      return acc
    })
  }

  const you = cumulativeFor(viewerUserId)
  const leader = cumulativeFor(c.leaderUserId)

  // Average = mean cumulative across the rated members (those present in the
  // per-round series). Each member's cumulative is computed once, then averaged
  // per round. Falls back to 0 when none.
  const allCumulative = [...byUser.keys()].map((u) => cumulativeFor(u))
  const average = rounds.map((_, i) => {
    if (allCumulative.length === 0) return 0
    const sum = allCumulative.reduce((s, arr) => s + (arr[i] ?? 0), 0)
    return Math.round(sum / allCumulative.length)
  })

  return { rounds, you, leader, average, state: stateFor(viewer.finishedCount) }
}

function classifyForm(s: FormSampleRow): FormOutcome {
  // Exact/result/miss is the policy-agnostic category ladder (same for range and
  // single-match pools — bonuses only change points, not the category), so we
  // read it straight off Score, not via a pool scoring policy.
  const score = Score.calculate(s.predHome, s.predAway, s.actualHome, s.actualAway) // leak-allow: policy-agnostic category, not policy-scored points
  if (score.points === 0) return 'miss'
  return score.isExact ? 'exact' : 'result'
}

function buildRecentForm(viewer: ParticipantStatsRow, samples: FormSampleRow[]): RecentFormBlock {
  // samples come most-recent first. Streak = leading run of non-miss hits.
  let currentStreak = 0
  for (const s of samples) {
    if (classifyForm(s) === 'miss') break
    currentStreak += 1
  }
  // Display oldest → newest.
  const outcomes = samples.map(classifyForm).reverse()
  return { outcomes, currentStreak, state: stateFor(viewer.finishedCount) }
}

function dimension(correct: number, total: number): DimensionStat {
  return { correct, total, pct: ratio(correct, total) }
}

function betterSide(low: DimensionStat, high: DimensionStat): 'low' | 'high' | null {
  if (low.total < MIN_SAMPLES || high.total < MIN_SAMPLES) return null
  const diff = low.pct - high.pct
  if (diff >= MARGIN) return 'low'
  if (-diff >= MARGIN) return 'high'
  return null
}

function buildStrengths(viewer: ParticipantStatsRow): StrengthsBlock {
  const low = dimension(viewer.lowGoalsCorrect, viewer.lowGoalsTotal)
  const high = dimension(viewer.highGoalsCorrect, viewer.highGoalsTotal)
  return {
    lowGoals: low,
    highGoals: high,
    betterAt: betterSide(low, high),
    state: stateFor(viewer.finishedCount),
  }
}
