import type { RankingHeroBlock } from './types'

const TREND = {
  rising: { label: 'Subiu', cls: 'text-green border-green', arrow: '▲' },
  falling: { label: 'Caiu', cls: 'text-red border-red', arrow: '▼' },
  stable: { label: 'Estável', cls: 'text-gray-muted border-border', arrow: '–' },
} as const

const ORDINAL = ['', '1º', '2º', '3º'] as const
function ordinal(pos: number): string {
  return ORDINAL[pos] ?? `${pos}º`
}

/**
 * The glanceable headline of the panel: where the viewer stands. One big number
 * (their position) with the field size, a trend chip, and how far the leader is.
 */
export function RankingHero({ block }: { block: RankingHeroBlock }) {
  const t = TREND[block.trend]
  const insufficient = block.state === 'insufficient_data' || block.position == null

  return (
    <section className="border-2 border-black bg-black px-5 py-6 text-white">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-6xl font-black leading-none lg:text-7xl">
            {insufficient ? '—' : ordinal(block.position as number)}
          </span>
          <span className="font-display text-base font-semibold uppercase tracking-wider text-white/60">
            de {block.memberCount}
          </span>
        </div>
        {!insufficient && (
          <span
            className={`shrink-0 border bg-white px-2.5 py-1 font-display text-xs font-bold uppercase tracking-widest ${t.cls}`}
          >
            {t.arrow} {t.label}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-xs font-semibold uppercase tracking-widest text-white/70">
        {insufficient
          ? 'Sua posição aparece quando o 1º jogo terminar'
          : block.gapToLeader === 0
            ? 'Você lidera o bolão 🏆'
            : `${block.gapToLeader} pts atrás do líder`}
      </p>
    </section>
  )
}
