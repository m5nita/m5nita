import type { ScoringPolicy } from '../scoring/ScoringPolicy'
import { type PoolComparison, StatsComparisonPolicy } from './StatsComparisonPolicy'
import type {
  ParticipantStatsRow,
  PoolStatsAggregateRow,
  RoundPointsRow,
} from './StatsRepository.port'

export type BlockState = 'ok' | 'insufficient_data'
export type Trend = 'rising' | 'falling' | 'stable'

export type HitRateBlock = {
  exactPct: { you: number; average: number; leader: number }
  resultPct: { you: number; average: number; leader: number }
  state: BlockState
}

export type RankingEvolutionBlock = {
  perRound: { matchday: number; points: number }[]
  position: number | null
  gapToLeader: number
  trend: Trend
  state: BlockState
}

export type DimensionStat = { correct: number; total: number; pct: number }

export type StrengthsBlock = {
  home: DimensionStat
  away: DimensionStat
  lowGoals: DimensionStat
  highGoals: DimensionStat
  state: BlockState
}

export type PointsLeftBlock = {
  earned: number
  maxPossible: number
  leftOnTable: number
  efficiency: number
  efficiencyVsAverage: number
  state: BlockState
}

export type StatsBlocks = {
  hitRateVsAverage: HitRateBlock
  rankingEvolution: RankingEvolutionBlock
  strengthsWeaknesses: StrengthsBlock
  pointsLeftOnTable: PointsLeftBlock
}

export type BuildInput = {
  viewer: ParticipantStatsRow
  aggregate: PoolStatsAggregateRow[]
  rounds: RoundPointsRow[]
  scoringPolicy: ScoringPolicy
}

/**
 * Builds the four comparison blocks from the viewer's raw finished-match counts,
 * the anonymized pool aggregate, and the per-round series. Pure: it does not
 * touch the DB and never re-derives scoring (it consumes already-persisted
 * points). Max points per match come from the pool's scoring policy (10 range /
 * 14 single-match), never a hardcoded constant.
 */
export const ParticipantPoolStats = {
  build(input: BuildInput): StatsBlocks {
    const { viewer, aggregate, rounds, scoringPolicy } = input
    const maxPoints = scoringPolicy.maxPoints()
    const comparison = StatsComparisonPolicy.compute(aggregate, maxPoints)

    return {
      hitRateVsAverage: buildHitRate(viewer, comparison),
      rankingEvolution: buildRankingEvolution(viewer, rounds, comparison),
      strengthsWeaknesses: buildStrengths(viewer),
      pointsLeftOnTable: buildPointsLeft(viewer, comparison, maxPoints),
    }
  },
}

function ratio(correct: number, total: number): number {
  return total > 0 ? correct / total : 0
}

function stateFor(total: number): BlockState {
  return total > 0 ? 'ok' : 'insufficient_data'
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

function trendOf(position: number | null, prev: number | null): Trend {
  if (position == null || prev == null) return 'stable'
  if (position < prev) return 'rising'
  if (position > prev) return 'falling'
  return 'stable'
}

function buildRankingEvolution(
  viewer: ParticipantStatsRow,
  rounds: RoundPointsRow[],
  c: PoolComparison,
): RankingEvolutionBlock {
  return {
    perRound: rounds.map((r) => ({ matchday: r.matchday, points: r.points })),
    position: viewer.position,
    gapToLeader: Math.max(0, c.leaderPoints - viewer.pointsTotal),
    trend: trendOf(viewer.position, viewer.prevPosition),
    state: stateFor(rounds.length),
  }
}

function dimension(correct: number, total: number): DimensionStat {
  return { correct, total, pct: ratio(correct, total) }
}

function buildStrengths(viewer: ParticipantStatsRow): StrengthsBlock {
  return {
    home: dimension(viewer.homeCorrect, viewer.homeTotal),
    away: dimension(viewer.awayCorrect, viewer.awayTotal),
    lowGoals: dimension(viewer.lowGoalsCorrect, viewer.lowGoalsTotal),
    highGoals: dimension(viewer.highGoalsCorrect, viewer.highGoalsTotal),
    state: stateFor(viewer.finishedCount),
  }
}

function buildPointsLeft(
  viewer: ParticipantStatsRow,
  c: PoolComparison,
  maxPoints: number,
): PointsLeftBlock {
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
