export type BlockState = 'ok' | 'insufficient_data'

export type HitRateBlock = {
  exactPct: { you: number; average: number; leader: number }
  resultPct: { you: number; average: number; leader: number }
  state: BlockState
}

export type RankingEvolutionBlock = {
  perRound: { matchday: number; points: number }[]
  position: number | null
  gapToLeader: number
  trend: 'rising' | 'falling' | 'stable'
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

export type PendingMatchImpact = {
  matchId: string
  homeTeam: string
  awayTeam: string
  kickoff: string
  hasPrediction: boolean
  action: 'submit' | 'change'
  impact: 'high' | 'medium' | 'low'
  pointsAtStake: number
  reachableRivals: number
}

export type Suggestion = {
  kind: string
  text: string
  detail: string
  basis: 'own_history'
}

export type StatsResponse =
  | {
      unlocked: false
      price: { centavos: number; formatted: string }
      teaser: { blocks: string[]; headline: string }
    }
  | {
      unlocked: true
      blocks: StatsBlocks
      pendingImpact: PendingMatchImpact[]
      suggestions: Suggestion[]
    }
