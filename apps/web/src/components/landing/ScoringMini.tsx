import { SCORING } from '@m5nita/shared'
import { Link } from '@tanstack/react-router'

const tiers = [
  {
    points: SCORING.EXACT_MATCH,
    label: 'Placar exato',
    example: 'palpite 2×1, deu 2×1',
    color: 'bg-green',
  },
  {
    points: SCORING.WINNER_AND_DIFF,
    label: 'Resultado + saldo',
    example: 'palpite 3×1, deu 2×0',
    color: 'bg-green/70',
  },
  {
    points: SCORING.OUTCOME_CORRECT,
    label: 'Acertou o vencedor',
    example: 'palpite 1×0, deu 3×0',
    color: 'bg-green/40',
  },
  {
    points: SCORING.MISS,
    label: 'Errou tudo',
    example: 'palpite 2×0, deu 0×1',
    color: 'bg-border',
  },
]

export function ScoringMini() {
  return (
    <section className="flex flex-col gap-6 pt-4 pb-16">
      <div>
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Pontuação
        </p>
        <h2 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          Como pontua
        </h2>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>
      <div className="flex flex-col gap-2">
        {tiers.map((tier) => (
          <div key={tier.label} className="flex items-center gap-3 py-2">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center font-display text-lg font-black text-white ${tier.color}`}
            >
              {tier.points}
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-black">
                {tier.label}
              </p>
              <p className="mt-1 text-xs text-gray-muted">{tier.example}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-gray-dark">
        Empate? Quem tiver mais <strong className="text-black">placares exatos</strong> fica à
        frente.
      </p>
      <Link
        to="/how-it-works"
        className="self-start font-display text-xs font-bold uppercase tracking-widest text-gray-muted hover:text-black transition-colors"
      >
        Ver regras completas →
      </Link>
    </section>
  )
}
