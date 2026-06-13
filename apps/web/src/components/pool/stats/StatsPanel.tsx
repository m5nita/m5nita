import { AccuracyDonut } from './AccuracyDonut'
import { CompareBar } from './CompareBar'
import { EfficiencyDonut } from './EfficiencyDonut'
import { EvolutionLineChart } from './EvolutionLineChart'
import { PendingImpactSection } from './PendingImpactSection'
import { RankingHero } from './RankingHero'
import { RecentFormStrip } from './RecentFormStrip'
import type { DimensionStat, PendingMatchImpact, StatsBlocks } from './types'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-l-4 border-black pl-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text-primary">
          {title}
        </h2>
        {hint && <p className="text-xs leading-snug text-text-secondary">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Insufficient() {
  return (
    <p className="border-2 border-dashed border-border py-6 text-center font-display text-xs font-semibold uppercase tracking-wider text-gray-muted">
      Dados insuficientes ainda
    </p>
  )
}

function DimensionRow({ caption, stat }: { caption: string; stat: DimensionStat }) {
  const width = `${Math.min(100, Math.max(0, stat.pct * 100))}%`
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs font-semibold text-text-primary">{caption}</span>
        <span className="font-display text-xs font-bold text-text-primary">
          {stat.total > 0 ? pct(stat.pct) : '—'}{' '}
          <span className="font-normal text-gray-muted">
            ({stat.correct}/{stat.total})
          </span>
        </span>
      </div>
      <div className="h-2 bg-border" aria-hidden="true">
        <div className="h-full bg-green" style={{ width }} />
      </div>
    </div>
  )
}

const BETTER_AT_LABEL = {
  low: 'Você vai melhor em jogos truncados (poucos gols).',
  high: 'Você vai melhor em jogos abertos (muitos gols).',
} as const

export function StatsPanel({
  poolId,
  blocks,
  pendingImpact,
}: {
  poolId: string
  blocks: StatsBlocks
  pendingImpact: PendingMatchImpact[]
}) {
  const { ranking, hitRate, efficiency, distribution, evolution, recentForm, strengths } = blocks

  return (
    <div className="flex flex-col gap-8">
      <RankingHero block={ranking} />

      <Section title="Aproveitamento" hint="Com que frequência você acerta, vs média e líder.">
        {hitRate.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <CompareBar
              label="Placares exatos"
              you={hitRate.exactPct.you}
              average={hitRate.exactPct.average}
              leader={hitRate.exactPct.leader}
            />
            <CompareBar
              label="Acertos de resultado"
              you={hitRate.resultPct.you}
              average={hitRate.resultPct.average}
              leader={hitRate.resultPct.leader}
            />
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Eficiência" hint="Quanto dos pontos possíveis você fez.">
          {efficiency.state === 'insufficient_data' ? (
            <Insufficient />
          ) : (
            <EfficiencyDonut block={efficiency} />
          )}
        </Section>

        <Section title="Distribuição dos acertos" hint="Como seus palpites se dividem.">
          {distribution.state === 'insufficient_data' ? (
            <Insufficient />
          ) : (
            <AccuracyDonut block={distribution} />
          )}
        </Section>
      </div>

      <Section title="Evolução" hint="Pontos acumulados por rodada — você, líder e média.">
        {evolution.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <EvolutionLineChart block={evolution} />
        )}
      </Section>

      <Section title="Forma recente" hint="Seus últimos palpites.">
        {recentForm.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <RecentFormStrip block={recentForm} />
        )}
      </Section>

      <Section title="Forças por tipo de jogo">
        {strengths.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="flex flex-col gap-3.5">
            <DimensionRow caption="Poucos gols (até 2)" stat={strengths.lowGoals} />
            <DimensionRow caption="Muitos gols (3+)" stat={strengths.highGoals} />
            {strengths.betterAt && (
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-green">
                → {BETTER_AT_LABEL[strengths.betterAt]}
              </p>
            )}
          </div>
        )}
      </Section>

      <PendingImpactSection poolId={poolId} items={pendingImpact} />
    </div>
  )
}
