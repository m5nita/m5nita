import type { GoalTypeCard, PredictorProfileBlock } from './types'

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

// pt-BR decimal (3,4 not 3.4).
function dec1(v: number): string {
  return v.toFixed(1).replace('.', ',')
}

type Tone = 'red' | 'amber' | 'green' | 'neutral'

const DOT: Record<Tone, string> = {
  red: 'bg-red',
  amber: 'bg-amber',
  green: 'bg-green',
  neutral: 'bg-gray-muted',
}

const FIG: Record<Tone, string> = {
  red: 'text-red',
  amber: 'text-amber',
  green: 'text-green',
  neutral: 'text-text-primary',
}

/**
 * One coaching card: a colored signal, a title + plain-language verdict, the key
 * figure, an optional chip, and exactly one actionable tip. The figure/extra
 * slot holds whatever the card needs (a big number, two bars…).
 */
function Card({
  tone,
  title,
  verdict,
  tip,
  children,
}: {
  tone: Tone
  title: string
  verdict: string
  tip: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5 border-2 border-border p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[tone]}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-text-primary">
            {title}
          </p>
          <p className="mt-0.5 text-xs leading-snug text-text-secondary">{verdict}</p>
        </div>
      </div>
      {children && <div className="pl-[22px]">{children}</div>}
      <p className="ml-[22px] border-t border-dashed border-border pt-2 text-[11px] leading-snug text-gray-muted">
        {tip}
      </p>
    </div>
  )
}

function Figure({ tone, value, suffix }: { tone: Tone; value: string; suffix: React.ReactNode }) {
  return (
    <p className="flex items-baseline gap-2">
      <span className={`font-display text-3xl font-black leading-none ${FIG[tone]}`}>{value}</span>
      <span className="text-xs leading-snug text-gray-muted">{suffix}</span>
    </p>
  )
}

const CAL_TITLE = {
  inflate: 'Mão pesada nos gols',
  economize: 'Mão leve nos gols',
  calibrated: 'Placar calibrado',
} as const

const CAL_VERDICT = {
  inflate: 'Seus placares somam mais gols que a realidade.',
  economize: 'Seus placares somam menos gols que a realidade.',
  calibrated: 'Você acerta bem o volume de gols dos jogos.',
} as const

const CAL_TIP = {
  inflate: 'Baixar um gol nos seus chutes aproxima do placar exato.',
  economize: 'Arriscar mais gols nos jogos abertos pode render.',
  calibrated: 'Boa noção de placar — varie os resultados pra cravar mais.',
} as const

function GoalTypeBars({ card }: { card: GoalTypeCard }) {
  const rows = [
    { label: 'Poucos gols (até 2)', stat: card.low },
    { label: 'Muitos gols (3+)', stat: card.high },
  ]
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-xs font-semibold text-text-primary">{r.label}</span>
            <span className="font-display text-xs font-bold text-text-primary">
              {r.stat.total > 0 ? pct(r.stat.pct) : '—'}{' '}
              <span className="font-normal text-gray-muted">
                ({r.stat.correct}/{r.stat.total})
              </span>
            </span>
          </div>
          <div className="h-2 bg-border" aria-hidden="true">
            <div
              className="h-full bg-green"
              style={{ width: `${Math.min(100, Math.max(0, r.stat.pct * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * "Seu perfil de palpiteiro": the coaching cards that turn the viewer's own
 * prediction history into self-knowledge + a tip. Each card renders only when
 * the API surfaced it (gate met); the panel shows the insufficient state when
 * none qualify.
 */
export function PredictorProfile({ block }: { block: PredictorProfileBlock }) {
  const { drawBlindness, nearMiss, goalCalibration, goalType } = block
  return (
    <div className="flex flex-col gap-3">
      {drawBlindness && (
        <Card
          tone="red"
          title="Empate cego"
          verdict="Você quase nunca aposta no empate — e ele acontece bastante."
          tip="Cravar 1×1 num jogo parelho rende pontos que o bolão inteiro deixa passar."
        >
          <Figure
            tone="red"
            value={pct(drawBlindness.yourRate)}
            suffix={
              <>
                dos seus palpites ·{' '}
                <b className="font-semibold text-text-secondary">{pct(drawBlindness.realRate)}</b>{' '}
                dos jogos empataram
              </>
            }
          />
        </Card>
      )}

      {nearMiss && (
        <Card
          tone="amber"
          title="Quase lá"
          verdict="Você passou raspando do placar exato."
          tip="Ajuste fino no placar vira muito ponto."
        >
          <Figure
            tone="amber"
            value={`+${nearMiss.points}`}
            suffix={
              <>
                <b className="font-semibold text-text-secondary">pts</b> a 1 gol — em{' '}
                {nearMiss.count} jogo{nearMiss.count > 1 ? 's' : ''}
              </>
            }
          />
        </Card>
      )}

      {goalCalibration && (
        <Card
          tone={goalCalibration.lean === 'calibrated' ? 'green' : 'amber'}
          title={CAL_TITLE[goalCalibration.lean]}
          verdict={CAL_VERDICT[goalCalibration.lean]}
          tip={CAL_TIP[goalCalibration.lean]}
        >
          <div className="flex flex-col gap-2">
            <Figure
              tone={goalCalibration.lean === 'calibrated' ? 'green' : 'amber'}
              value={dec1(goalCalibration.yourAvg)}
              suffix={
                <>
                  gols/jogo · real{' '}
                  <b className="font-semibold text-text-secondary">
                    {dec1(goalCalibration.realAvg)}
                  </b>
                </>
              }
            />
            {goalCalibration.signature && (
              <span className="self-start border border-border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                Placar-assinatura: {goalCalibration.signature.home}×{goalCalibration.signature.away}{' '}
                ({pct(goalCalibration.signature.sharePct)})
              </span>
            )}
          </div>
        </Card>
      )}

      {goalType && (
        <Card
          tone={goalType.betterAt ? 'green' : 'neutral'}
          title="Truncado vs aberto"
          verdict={
            goalType.betterAt === 'low'
              ? 'Você vai melhor em jogos truncados (poucos gols).'
              : goalType.betterAt === 'high'
                ? 'Você vai melhor em jogos abertos (muitos gols).'
                : 'Seu aproveitamento por volume de gols.'
          }
          tip={
            goalType.betterAt === 'low'
              ? 'Nos jogos abertos, segure a mão no placar.'
              : goalType.betterAt === 'high'
                ? 'Nos jogos truncados, ouse menos gols.'
                : 'Equilibrado nos dois tipos — siga assim.'
          }
        >
          <GoalTypeBars card={goalType} />
        </Card>
      )}
    </div>
  )
}
