// Static data driving the landing demos. Plain values, no API.
// Flag URLs (provided by user) point to football-data.org crests CDN.

export const FLAGS = {
  brasil: 'https://crests.football-data.org/764.svg',
  argentina: 'https://crests.football-data.org/762.png',
  barcelona: 'https://crests.football-data.org/81.png',
  realMadrid: 'https://crests.football-data.org/86.png',
  flamengo: 'https://crests.football-data.org/1783.png',
  palmeiras: 'https://crests.football-data.org/1769.png',
  liverpool: 'https://crests.football-data.org/64.png',
  manchesterCity: 'https://crests.football-data.org/65.png',
} as const

export type DemoMatchState = 'finished' | 'live' | 'pending'

export interface DemoMatch {
  id: string
  date: string // formato "DD/MM"
  state: DemoMatchState
  home: { name: string; flag: string }
  away: { name: string; flag: string }
  myPrediction?: { home: number; away: number }
  actual?: { home: number; away: number }
  myPoints?: number // pts confirmados (finished) ou provisórios (live)
  predictedHome?: number // dígitos animados na demo (M3/M4)
  predictedAway?: number
  predictors?: Array<{
    name: string
    home: number
    away: number
    points: number
  }>
}

export const DEMO_MATCHES: DemoMatch[] = [
  {
    id: 'm1-bar-rma',
    date: '21/06',
    state: 'finished',
    home: { name: 'Barcelona', flag: FLAGS.barcelona },
    away: { name: 'Real Madrid', flag: FLAGS.realMadrid },
    myPrediction: { home: 2, away: 1 },
    actual: { home: 2, away: 1 },
    myPoints: 10, // EXACT_MATCH
  },
  {
    id: 'm2-bra-arg',
    date: '22/06',
    state: 'live',
    home: { name: 'Brasil', flag: FLAGS.brasil },
    away: { name: 'Argentina', flag: FLAGS.argentina },
    myPrediction: { home: 2, away: 1 },
    actual: { home: 1, away: 0 },
    myPoints: 7, // WINNER_AND_DIFF (winner correct, same goal-difference)
    predictors: [
      { name: 'João', home: 1, away: 0, points: 10 }, // EXACT
      { name: 'Maria', home: 2, away: 1, points: 7 }, // WINNER_AND_DIFF
      { name: 'Carlos', home: 0, away: 0, points: 0 }, // MISS
    ],
  },
  {
    id: 'm3-fla-pal',
    date: '23/06',
    state: 'pending',
    home: { name: 'Flamengo', flag: FLAGS.flamengo },
    away: { name: 'Palmeiras', flag: FLAGS.palmeiras },
    predictedHome: 1,
    predictedAway: 0,
  },
  {
    id: 'm4-liv-mci',
    date: '24/06',
    state: 'pending',
    home: { name: 'Liverpool', flag: FLAGS.liverpool },
    away: { name: 'Manchester City', flag: FLAGS.manchesterCity },
    predictedHome: 1,
    predictedAway: 1,
  },
]

export interface DemoRankingEntry {
  id: string
  name: string
  isYou: boolean
  exactMatches: number
  initialPoints: number
  initialSlot: number
  finalSlot: number
  initialPositionLabel: string // "01" .. "05" — antes da reordenação
  finalPositionLabel: string // "01" .. "05" — depois
  initialPositionColor: 'p1' | 'p2' | 'p3' | 'p4' | 'p5'
  finalPositionColor: 'p1' | 'p2' | 'p3' | 'p4' | 'p5'
  liveDelta?: number // pontos provisórios (somente Você)
}

export const DEMO_RANKING: DemoRankingEntry[] = [
  {
    id: 'joao',
    name: 'João',
    isYou: false,
    exactMatches: 2,
    initialPoints: 12,
    initialSlot: 0,
    finalSlot: 0,
    initialPositionLabel: '01',
    finalPositionLabel: '01',
    initialPositionColor: 'p1',
    finalPositionColor: 'p1',
  },
  {
    id: 'maria',
    name: 'Maria',
    isYou: false,
    exactMatches: 1,
    initialPoints: 10,
    initialSlot: 1,
    finalSlot: 2,
    initialPositionLabel: '02',
    finalPositionLabel: '03',
    initialPositionColor: 'p2',
    finalPositionColor: 'p3',
  },
  {
    id: 'carlos',
    name: 'Carlos',
    isYou: false,
    exactMatches: 1,
    initialPoints: 9,
    initialSlot: 2,
    finalSlot: 3,
    initialPositionLabel: '03',
    finalPositionLabel: '04',
    initialPositionColor: 'p3',
    finalPositionColor: 'p4',
  },
  {
    id: 'ana',
    name: 'Ana',
    isYou: false,
    exactMatches: 0,
    initialPoints: 7,
    initialSlot: 3,
    finalSlot: 4,
    initialPositionLabel: '04',
    finalPositionLabel: '05',
    initialPositionColor: 'p4',
    finalPositionColor: 'p5',
  },
  {
    id: 'voce',
    name: 'Você',
    isYou: true,
    exactMatches: 0,
    initialPoints: 5,
    initialSlot: 4,
    finalSlot: 1,
    initialPositionLabel: '05',
    finalPositionLabel: '02',
    initialPositionColor: 'p5',
    finalPositionColor: 'p2',
    liveDelta: 6,
  },
]
