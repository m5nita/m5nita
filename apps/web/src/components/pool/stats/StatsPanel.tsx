import { AccuracyDonut } from './AccuracyDonut'
import { ClimbCard } from './ClimbCard'
import { CompareBar } from './CompareBar'
import { EfficiencyDonut } from './EfficiencyDonut'
import { EvolutionLineChart } from './EvolutionLineChart'
import { PredictorProfile } from './PredictorProfile'
import { RankingHero } from './RankingHero'
import { RecentFormStrip } from './RecentFormStrip'
import type { StatsBlocks } from './types'

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
      Jogue mais alguns palpites pra desbloquear
    </p>
  )
}

export function StatsPanel({ poolId, blocks }: { poolId: string; blocks: StatsBlocks }) {
  const { ranking, hitRate, efficiency, distribution, evolution, recentForm, profile, climb } =
    blocks

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

      <Section title="Evolução" hint="Pontos acumulados jogo a jogo — você, líder e média.">
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

      <Section title="Seu perfil de palpiteiro" hint="O que seus palpites revelam sobre você.">
        {profile.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <PredictorProfile block={profile} />
        )}
      </Section>

      <Section title="Caminho até o topo" hint="O que falta — e o próximo passo.">
        <ClimbCard poolId={poolId} block={climb} />
      </Section>
    </div>
  )
}
