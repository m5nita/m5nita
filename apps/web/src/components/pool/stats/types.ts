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

// ── Predictor profile ("Seu perfil de palpiteiro") ──────────────────────────
// Each card is null when its gate is not met (omitted, not shown empty).

/** You bet draws far less often than they actually happen — the unmissed point. */
export type DrawBlindnessCard = {
  yourRate: number
  realRate: number
  yourCount: number
  realCount: number
}

/** Predictions one goal from the exact score, and the points that would add. */
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
  state: BlockState
}

export type StatsBlocks = {
  ranking: RankingHeroBlock
  hitRate: HitRateBlock
  efficiency: EfficiencyBlock
  distribution: DistributionBlock
  evolution: EvolutionBlock
  recentForm: RecentFormBlock
  profile: PredictorProfileBlock
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
    }
