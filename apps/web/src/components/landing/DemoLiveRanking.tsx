import { DEMO_RANKING } from './mocks'
import { useInViewportLoop } from './useInViewportLoop'

const POSITION_COLOR: Record<'p1' | 'p2' | 'p3' | 'p4' | 'p5', string> = {
  p1: 'text-red',
  p2: 'text-black',
  p3: 'text-black',
  p4: 'text-gray-light',
  p5: 'text-gray-light',
}

export function DemoLiveRanking() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          03 — Ranking ao vivo
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          Suba (ou caia)
          <br />
          em segundos.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Os pontos atualizam enquanto o jogo rola. Provisórios em vermelho — confirmados ao apito
          final.
        </p>
      </div>

      <div
        ref={ref}
        className={`stage demo-d3 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="d3 flex flex-col gap-3">
          <div className="d3-header flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 font-display text-[10px] font-bold uppercase tracking-widest text-red">
              <span className="live-pulse w-1.5 h-1.5 rounded-full bg-red" aria-hidden="true" />
              Jogos ao vivo
            </div>
            <div className="font-display text-[10px] text-gray-muted">
              Pontos em vermelho são provisórios
            </div>
          </div>

          <div className="d3-list relative" style={{ height: '240px' }}>
            {DEMO_RANKING.map((entry) => (
              <div
                key={entry.id}
                className={`d3-row ${entry.isYou ? 'row-voce' : ''} absolute left-0 right-0 grid grid-cols-[40px_1fr_auto] gap-3 items-center border-b border-border h-12 px-3 py-1`}
                style={{
                  ['--initial-slot' as never]: entry.initialSlot,
                  ['--final-slot' as never]: entry.finalSlot,
                  background: entry.isYou ? 'var(--color-row-highlight)' : 'transparent',
                }}
              >
                <div className="d3-pos-wrap relative w-10 h-8">
                  <span
                    className={`d3-pos d3-pos-initial ${POSITION_COLOR[entry.initialPositionColor]} absolute inset-0 flex items-center justify-start font-display text-3xl font-black leading-none`}
                  >
                    {entry.initialPositionLabel}
                  </span>
                  <span
                    className={`d3-pos d3-pos-after ${POSITION_COLOR[entry.finalPositionColor]} absolute inset-0 flex items-center justify-start font-display text-3xl font-black leading-none`}
                  >
                    {entry.finalPositionLabel}
                  </span>
                </div>
                <div className="d3-name-block min-w-0 flex flex-col gap-0.5">
                  <span
                    className={`d3-name font-display text-sm font-bold uppercase tracking-wide ${entry.isYou ? 'text-red' : 'text-black'}`}
                  >
                    {entry.name}
                  </span>
                  <span className="d3-sub-row text-[10px] text-gray-muted">
                    {entry.exactMatches} placar{entry.exactMatches !== 1 ? 'es' : ''} exato
                    {entry.exactMatches !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="d3-pts-block text-right flex flex-col items-end">
                  <span className="d3-pts font-display text-2xl font-black text-black leading-none">
                    {entry.initialPoints}
                    {entry.liveDelta != null && (
                      <span className="d3-delta">
                        <span className="d3-delta-inner">+{entry.liveDelta}</span>
                      </span>
                    )}
                  </span>
                  <span className="d3-pts-label font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted mt-0.5">
                    pts
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
