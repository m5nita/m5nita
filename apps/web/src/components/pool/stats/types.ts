export type BlockState = 'ok' | 'insufficient_data'
export type Trend = 'rising' | 'falling' | 'stable'

/** Hero: the viewer's standing at a glance. */
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

/** Cumulative points per finished match — viewer vs leader vs pool average. */
export type EvolutionBlock = {
  /** ISO kickoff dates, one per finished match, in chronological order. */
  dates: string[]
  you: number[]
  leader: number[]
  average: number[]
  state: BlockState
}

export type FormOutcome = 'exact' | 'result' | 'miss'

/** The viewer's last N finished predictions (most recent last) + current streak. */
export type RecentFormBlock = {
  outcomes: FormOutcome[]
  currentStreak: number
  state: BlockState
}

/** All-time composition of the viewer's finished predictions. exact ⊆ result. */
export type DistributionBlock = {
  exact: number
  resultOnly: number
  miss: number
  total: number
  state: BlockState
}

export type DimensionStat = { correct: number; total: number; pct: number }

/** Goal-volume strengths (no home/away — meaningless at neutral WC venues). */
export type StrengthsBlock = {
  lowGoals: DimensionStat
  highGoals: DimensionStat
  /** Which side the viewer predicts clearly better, if any (the 1-line takeaway). */
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
    }
