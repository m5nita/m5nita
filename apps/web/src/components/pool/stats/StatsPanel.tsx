import { CompareBar } from './CompareBar'
import { PendingImpactSection } from './PendingImpactSection'
import { RoundChart } from './RoundChart'
import { SuggestionsSection } from './SuggestionsSection'
import type { DimensionStat, PendingMatchImpact, StatsBlocks, Suggestion } from './types'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function signedPct(v: number): string {
  const rounded = Math.round(v * 100)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 border-l-4 border-black pl-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text-primary">
          {title}
        </h2>
        <p className="text-xs leading-snug text-text-secondary">{hint}</p>
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
            (acertou {stat.correct} de {stat.total})
          </span>
        </span>
      </div>
      <div className="h-2 bg-border" aria-hidden="true">
        <div className="h-full bg-green" style={{ width }} />
      </div>
    </div>
  )
}

const TREND_LABEL = { rising: 'Subiu', falling: 'Caiu', stable: 'Estável' } as const
const TREND_CLASS = {
  rising: 'text-green',
  falling: 'text-red',
  stable: 'text-gray-muted',
} as const

export function StatsPanel({
  poolId,
  blocks,
  pendingImpact,
  suggestions,
}: {
  poolId: string
  blocks: StatsBlocks
  pendingImpact: PendingMatchImpact[]
  suggestions: Suggestion[]
}) {
  const {
    hitRateVsAverage: a,
    rankingEvolution: b,
    strengthsWeaknesses: c,
    pointsLeftOnTable: d,
  } = blocks

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Aproveitamento vs média"
        hint="Com que frequência você acerta, lado a lado com a média do bolão e o líder. Placar exato = você cravou o resultado; acerto de resultado = acertou quem venceu (ou o empate)."
      >
        {a.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="flex flex-col gap-5">
            <CompareBar
              label="Placares exatos"
              you={a.exactPct.you}
              average={a.exactPct.average}
              leader={a.exactPct.leader}
            />
            <CompareBar
              label="Acertos de resultado"
              you={a.resultPct.you}
              average={a.resultPct.average}
              leader={a.resultPct.leader}
            />
          </div>
        )}
      </Section>

      <Section
        title="Evolução no ranking"
        hint="As barras mostram seus pontos por rodada. A tendência é sobre o RANKING (não os pontos): indica se você subiu ou caiu de posição desde a última atualização — dá para pontuar mais e ainda assim cair, se os adversários pontuarem mais que você. 'Atrás do líder' é quantos pontos faltam para alcançar o 1º lugar."
      >
        {b.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-px bg-border">
              <div className="bg-cream py-3 text-center">
                <p className="font-display text-3xl font-black text-black">
                  {b.position != null ? String(b.position).padStart(2, '0') : '—'}
                </p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  Posição
                </p>
              </div>
              <div className="bg-cream py-3 text-center">
                <p className={`font-display text-3xl font-black ${TREND_CLASS[b.trend]}`}>
                  {TREND_LABEL[b.trend]}
                </p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  No ranking
                </p>
              </div>
              <div className="bg-cream py-3 text-center">
                <p className="font-display text-3xl font-black text-black">{b.gapToLeader}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  Atrás do líder
                </p>
              </div>
            </div>
            <RoundChart rounds={b.perRound} />
          </div>
        )}
      </Section>

      <Section
        title="Forças e fraquezas"
        hint="Quão bem você prevê cada tipo de jogo. 'Mandante venceu' = jogos em que o time da casa ganhou; 'poucos gols' = no máximo 2 gols no total (3 ou mais = muitos). A porcentagem é quanto desses jogos você acertou."
      >
        {c.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="flex flex-col gap-3.5">
            <DimensionRow caption="Quando o mandante venceu" stat={c.home} />
            <DimensionRow caption="Quando o visitante venceu" stat={c.away} />
            <DimensionRow caption="Jogos de poucos gols (até 2)" stat={c.lowGoals} />
            <DimensionRow caption="Jogos de muitos gols (3+)" stat={c.highGoals} />
          </div>
        )}
      </Section>

      <Section
        title="Pontos deixados na mesa"
        hint="Quantos pontos a mais você teria se tivesse cravado tudo. Eficiência = pontos feitos ÷ máximo possível; abaixo, como ela se compara à média do bolão."
      >
        {d.state === 'insufficient_data' ? (
          <Insufficient />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-px bg-border">
              <div className="bg-cream py-3 text-center">
                <p className="font-display text-2xl font-black text-black">{d.earned}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  Conquistados
                </p>
              </div>
              <div className="bg-cream py-3 text-center">
                <p className="font-display text-2xl font-black text-red">{d.leftOnTable}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  Na mesa
                </p>
              </div>
              <div className="bg-cream py-3 text-center">
                <p className="font-display text-2xl font-black text-black">{pct(d.efficiency)}</p>
                <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
                  Eficiência
                </p>
              </div>
            </div>
            <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
              <span className={d.efficiencyVsAverage >= 0 ? 'text-green' : 'text-red'}>
                {signedPct(d.efficiencyVsAverage)}
              </span>{' '}
              vs média do bolão
            </p>
          </div>
        )}
      </Section>

      <PendingImpactSection poolId={poolId} items={pendingImpact} />

      <SuggestionsSection items={suggestions} />
    </div>
  )
}
