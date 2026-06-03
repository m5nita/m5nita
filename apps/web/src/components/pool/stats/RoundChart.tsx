/**
 * Pontos que você fez em cada rodada já disputada — barras rotuladas (valor em
 * cima, rodada embaixo). Zero dependências; sem distorção de proporção.
 */
export function RoundChart({ rounds }: { rounds: { matchday: number; points: number }[] }) {
  if (rounds.length === 0) return null
  const max = Math.max(...rounds.map((r) => r.points), 1)

  return (
    <div className="flex items-end justify-around gap-3 pt-1">
      {rounds.map((r, i) => (
        <div key={r.matchday} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="font-display text-sm font-black text-text-primary">{r.points}</span>
          <div
            className="w-full max-w-[2.5rem] rounded-sm bg-green"
            style={{ height: `${Math.max(4, Math.round((r.points / max) * 96))}px` }}
            aria-hidden="true"
          />
          <span className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
            Rod. {i + 1}
          </span>
        </div>
      ))}
    </div>
  )
}
