import { SCORING, SINGLE_MATCH_MAX_POINTS } from '@m5nita/shared'
import { createFileRoute } from '@tanstack/react-router'

const steps = [
  {
    number: '01',
    title: 'Crie um bolão',
    description: 'Defina um nome, escolha o valor de entrada e compartilhe o link de convite.',
  },
  {
    number: '02',
    title: 'Convide seus amigos',
    description: 'Envie o código de convite. Cada participante paga para entrar no bolão.',
  },
  {
    number: '03',
    title: 'Faça seus palpites',
    description:
      'Palpite o placar de cada jogo da Copa do Mundo 2026 antes do início de cada partida.',
  },
  {
    number: '04',
    title: 'Acompanhe ao vivo',
    description:
      'Os placares atualizam em tempo real. Veja o ranking subir conforme os jogos acontecem.',
  },
  {
    number: '05',
    title: 'Leve o prêmio',
    description: 'O 1º lugar leva o prêmio total ao final da competição.',
  },
]

const scoringRules = [
  {
    points: SCORING.EXACT_MATCH,
    label: 'Placar exato',
    example: 'Palpite 2×1, resultado 2×1',
    color: 'bg-green',
  },
  {
    points: SCORING.WINNER_AND_WINNER_GOALS,
    label: 'Vencedor + gols do vencedor',
    example: 'Palpite 2×1, resultado 2×0',
    color: 'bg-green/80',
  },
  {
    points: SCORING.WINNER_AND_DIFF,
    label: 'Vencedor + saldo de gols',
    example: 'Palpite 3×1, resultado 2×0',
    color: 'bg-green/60',
  },
  {
    points: SCORING.OUTCOME_CORRECT,
    label: 'Acertou o vencedor ou empate',
    example: 'Palpite 1×0, resultado 3×0 · ou 1×1, resultado 0×0',
    color: 'bg-green/40',
  },
  {
    points: SCORING.MISS,
    label: 'Errou tudo',
    example: 'Palpite 2×0, resultado 0×1',
    color: 'bg-border',
  },
]

function HowItWorksPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Guia
        </p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          Como funciona?
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <section className="flex flex-col gap-0">
        {steps.map((step, i) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-black font-display text-sm font-black text-white">
                {step.number}
              </span>
              {i < steps.length - 1 && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className="pb-6">
              <h3 className="font-display text-sm font-black uppercase tracking-wide text-black">
                {step.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-dark">{step.description}</p>
            </div>
          </div>
        ))}
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Pontuação
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-col gap-2">
          {scoringRules.map((rule) => (
            <div key={rule.points} className="flex items-center gap-3 py-2">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center font-display text-lg font-black text-white ${rule.color}`}
              >
                {rule.points}
              </span>
              <div className="min-w-0">
                <p className="font-display text-sm font-black uppercase tracking-wide text-black">
                  {rule.label}
                </p>
                <p className="mt-1 text-sm text-gray-muted">{rule.example}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Jogo único
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-start gap-3 py-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-black font-display text-lg font-black text-white">
            +{SCORING.PROXIMITY_BONUS_CAP}
          </span>
          <p className="text-sm leading-relaxed text-gray-dark">
            Em bolões de <strong className="text-black">um jogo só</strong>, além dos pontos da
            categoria acima, você ganha um{' '}
            <strong className="text-black">bônus de proximidade</strong> de até{' '}
            <strong className="text-black">+{SCORING.PROXIMITY_BONUS_CAP} pts</strong>: quanto mais
            perto do placar real, maior o bônus, até o máximo de{' '}
            <strong className="text-black">{SINGLE_MATCH_MAX_POINTS} pts</strong> por jogo. Ex.:
            palpite 2×1 com resultado 3×1 vale 8 pts (5 pelo vencedor + 3 de proximidade). Errar o
            vencedor pesa mais e costuma zerar o bônus — palpite 2×1 com resultado 1×2 fica em 0
            pts.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Mata-mata
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-start gap-3 py-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-black font-display text-lg font-black text-white">
            +{SCORING.ADVANCE_BONUS}
          </span>
          <p className="text-sm leading-relaxed text-gray-dark">
            Nos jogos de mata-mata, o seu placar vale pelo{' '}
            <strong className="text-black">tempo normal (90 min)</strong>. Se a partida for para a{' '}
            <strong className="text-black">prorrogação ou pênaltis</strong>, você palpita também{' '}
            <strong className="text-black">quem se classifica</strong> e ganha{' '}
            <strong className="text-black">+{SCORING.ADVANCE_BONUS} pontos</strong> se acertar.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Desempate
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <p className="text-sm leading-relaxed text-gray-dark">
          Em caso de empate na pontuação, quem tiver mais{' '}
          <strong className="text-black">placares exatos</strong> fica à frente no ranking.
        </p>
      </section>
    </div>
  )
}

export const Route = createFileRoute('/how-it-works')({ component: HowItWorksPage })
