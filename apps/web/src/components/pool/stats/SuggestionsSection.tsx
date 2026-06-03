import type { Suggestion } from './types'

/**
 * Tips derived solely from the viewer's own historical hits. Empty → a neutral
 * "not enough history yet" state (never a fabricated tip, never third-party data).
 */
export function SuggestionsSection({ items }: { items: Suggestion[] }) {
  return (
    <section className="flex flex-col gap-4 border-l-4 border-black pl-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text-primary">
          Dicas pelo seu padrão
        </h2>
        <p className="text-xs leading-snug text-text-secondary">
          Comparamos seu acerto entre tipos de jogo — mandante x visitante e poucos x muitos gols —
          e apontamos onde você se sai melhor. Só com o seu histórico, nunca com o palpite dos
          outros.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="border-2 border-dashed border-border py-6 text-center font-display text-xs font-semibold uppercase tracking-wider text-gray-muted">
          Ainda não há histórico suficiente para dicas
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((s) => (
            <li key={s.kind} className="flex items-start gap-3 border-2 border-border p-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red" aria-hidden="true" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-text-primary">{s.text}</p>
                <p className="text-xs leading-snug text-text-secondary">{s.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
