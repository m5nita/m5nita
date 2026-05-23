// Portuguese display labels for cup stage constants surfaced by the football-
// data provider. Single source for picker, invite page and OG image (FR-010 /
// FR-003 / U2). Unknown values fall back to the raw enum so new provider
// values don't crash the UI.

const PRIMARY: Record<string, string> = {
  // football-data UPPER_SNAKE form
  ROUND_OF_32: 'Trigésimas de Final',
  ROUND_OF_16: 'Oitavas de Final',
  QUARTER_FINALS: 'Quartas de Final',
  SEMI_FINALS: 'Semifinal',
  FINAL: 'Final',
  THIRD_PLACE: 'Disputa de 3º lugar',
  GROUP_STAGE: 'Fase de Grupos',
  LEAGUE: 'Pontos Corridos',
  REGULAR_SEASON: 'Pontos Corridos',
  // football-data lower-hyphen form (alternate, seen in production sync)
  'round-of-32': 'Trigésimas de Final',
  'round-of-16': 'Oitavas de Final',
  quarter: 'Quartas de Final',
  semi: 'Semifinal',
  final: 'Final',
  'third-place': 'Disputa de 3º lugar',
  'group-stage': 'Fase de Grupos',
  league: 'Pontos Corridos',
}

const LEG_SUFFIX: Record<string, string> = {
  '1ST_LEG': ' — Ida',
  '2ND_LEG': ' — Volta',
}

export function stageLabel(stage: string | null): string {
  if (!stage) return ''
  const upper = stage.toUpperCase()

  for (const [needle, suffix] of Object.entries(LEG_SUFFIX)) {
    if (upper.endsWith(`_${needle}`)) {
      const base = upper.slice(0, -needle.length - 1)
      const baseLabel = PRIMARY[base] ?? PRIMARY[base.toLowerCase()] ?? base
      return `${baseLabel}${suffix}`
    }
  }

  return PRIMARY[stage] ?? PRIMARY[upper] ?? stage
}
