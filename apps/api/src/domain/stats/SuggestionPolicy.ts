import type { ParticipantStatsRow } from './StatsRepository.port'

export type Suggestion = {
  kind: string
  /** The actionable tip in one line. */
  text: string
  /** The evidence behind it (the two rates being compared). */
  detail: string
  /** Always 'own_history' — derived solely from the viewer's own past hits. */
  basis: 'own_history'
}

// A dimension needs at least this many finished samples on BOTH sides before we
// claim a tendency, and the gap must be at least MARGIN to be worth surfacing.
const MIN_SAMPLES = 3
const MARGIN = 0.15

type Side = { correct: number; total: number }

/**
 * Derives prediction tips from ONLY the viewer's own finished-match dimension
 * counts. Each tip compares two opposite kinds of game and points to the one
 * the viewer predicts better, with the rates as evidence. Never reads another
 * member's data. Empty when there isn't enough history or no clear tendency.
 */
export const SuggestionPolicy = {
  suggest(viewer: ParticipantStatsRow): Suggestion[] {
    const out: Suggestion[] = []

    const home: Side = { correct: viewer.homeCorrect, total: viewer.homeTotal }
    const away: Side = { correct: viewer.awayCorrect, total: viewer.awayTotal }
    const homeVsAway = compare(home, away)
    if (homeVsAway === 'first') {
      out.push(
        tip(
          'home_strength',
          'Você acerta mais quando o mandante vence.',
          `Mando ${fmt(home)} · Visitante ${fmt(away)}. Aposte com mais confiança quando o time da casa for favorito.`,
        ),
      )
    } else if (homeVsAway === 'second') {
      out.push(
        tip(
          'away_strength',
          'Você acerta mais quando o visitante vence.',
          `Visitante ${fmt(away)} · Mando ${fmt(home)}. Considere mais os visitantes nos seus palpites.`,
        ),
      )
    }

    const low: Side = { correct: viewer.lowGoalsCorrect, total: viewer.lowGoalsTotal }
    const high: Side = { correct: viewer.highGoalsCorrect, total: viewer.highGoalsTotal }
    const lowVsHigh = compare(low, high)
    if (lowVsHigh === 'first') {
      out.push(
        tip(
          'low_goals_strength',
          'Você acerta mais os jogos de poucos gols.',
          `Poucos gols (até 2): ${fmt(low)} · Muitos gols (3+): ${fmt(high)}. Em jogos truncados, confie mais no seu palpite.`,
        ),
      )
    } else if (lowVsHigh === 'second') {
      out.push(
        tip(
          'high_goals_strength',
          'Você acerta mais os jogos de muitos gols.',
          `Muitos gols (3+): ${fmt(high)} · Poucos gols (até 2): ${fmt(low)}. Em jogos abertos, confie mais no seu palpite.`,
        ),
      )
    }

    return out
  },
}

function tip(kind: string, text: string, detail: string): Suggestion {
  return { kind, text, detail, basis: 'own_history' }
}

function rate(s: Side): number {
  return s.total > 0 ? s.correct / s.total : 0
}

function fmt(s: Side): string {
  return `${Math.round(rate(s) * 100)}% (${s.correct}/${s.total})`
}

function compare(a: Side, b: Side): 'first' | 'second' | null {
  if (a.total < MIN_SAMPLES || b.total < MIN_SAMPLES) return null
  const diff = rate(a) - rate(b)
  if (diff >= MARGIN) return 'first'
  if (-diff >= MARGIN) return 'second'
  return null
}
