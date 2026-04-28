import { DEMO_MATCHES, type DemoMatch } from './mocks'
import { useInViewportLoop } from './useInViewportLoop'

function MatchRow({ match, idx }: { match: DemoMatch; idx: number }) {
  const rowClass = `d2-row m${idx + 1} border-b border-border py-3 last:border-b-0 relative`

  if (match.state === 'finished' && match.actual && match.myPrediction) {
    return (
      <div className={rowClass}>
        <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
          {match.date}
        </div>
        <div className="d2-status-line flex items-center justify-center gap-2 mb-1 font-display text-[10px] font-bold uppercase leading-none tracking-widest text-gray-muted">
          <span>Resultado oficial</span>
          <span className="flex items-center gap-1.5">
            <span>{match.actual.home}</span>
            <span>x</span>
            <span>{match.actual.away}</span>
          </span>
        </div>
        <div className="d2-main flex items-center gap-2">
          <TeamSideHome name={match.home.name} flag={match.home.flag} />
          <ScoreLockedDisplay home={match.myPrediction.home} away={match.myPrediction.away} />
          <TeamSideAway name={match.away.name} flag={match.away.flag} />
        </div>
        <div className="d2-points mt-1 flex items-center justify-center gap-1 font-display text-xs font-black text-green leading-none">
          +{match.myPoints} pts
        </div>
        <ToggleButton initiallyExpanded={false} />
      </div>
    )
  }

  if (match.state === 'live' && match.actual && match.myPrediction && match.predictors) {
    return (
      <div className={rowClass}>
        <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
          {match.date}
        </div>
        <div className="d2-status-line flex items-center justify-center gap-2 mb-1 font-display text-[10px] font-bold uppercase leading-none tracking-widest text-red">
          <span className="flex items-center gap-1">
            <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />
            Ao Vivo
          </span>
          <span className="flex items-center gap-1.5">
            <span>{match.actual.home}</span>
            <span>x</span>
            <span>{match.actual.away}</span>
          </span>
        </div>
        <div className="d2-main flex items-center gap-2">
          <TeamSideHome name={match.home.name} flag={match.home.flag} />
          <ScoreLockedDisplay home={match.myPrediction.home} away={match.myPrediction.away} />
          <TeamSideAway name={match.away.name} flag={match.away.flag} />
        </div>
        <div className="d2-points mt-1 flex items-center justify-center gap-1 font-display text-xs font-black text-red leading-none">
          <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />+
          {match.myPoints} pts
        </div>
        <ToggleButton initiallyExpanded={true} className="m2-toggle" />
        <div
          className="d2-predictors m2-panel overflow-hidden"
          style={{
            marginLeft: '-24px',
            marginRight: '-24px',
            background: 'var(--color-panel-tint)',
            padding: '0 24px',
          }}
        >
          {match.predictors.map((p) => (
            <div
              key={p.name}
              className="d2-pred-row flex items-center gap-2 py-2 border-b border-border/60 last:border-b-0"
            >
              <span className="d2-pred-name flex-1 truncate font-display text-xs font-bold uppercase tracking-wide text-black">
                {p.name}
              </span>
              <div className="d2-pred-score flex items-center gap-1">
                <div className="flex items-center justify-center h-8 w-8 border-2 border-border/50 font-display text-base font-black text-gray-muted">
                  {p.home}
                </div>
                <span className="font-display text-[11px] font-black text-gray-muted">x</span>
                <div className="flex items-center justify-center h-8 w-8 border-2 border-border/50 font-display text-base font-black text-gray-muted">
                  {p.away}
                </div>
              </div>
              <span className="d2-pred-pts flex items-center justify-end gap-1 min-w-[48px] font-display text-xs font-black text-red">
                <span className="live-pulse w-1 h-1 rounded-full bg-red" aria-hidden="true" />+
                {p.points} pts
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // pending — animated palpite
  return (
    <div className={rowClass}>
      <div className="d2-date text-center font-display text-[10px] text-gray-muted mb-1.5">
        {match.date}
      </div>
      <div className="d2-main flex items-center gap-2">
        <TeamSideHome name={match.home.name} flag={match.home.flag} />
        <div className="d2-score flex items-center gap-1">
          <div className="d2-home-input h-10 w-10 border-2 border-border bg-transparent flex items-center justify-center font-display text-lg font-black text-black">
            <span className="d2-home-digit">{match.predictedHome}</span>
          </div>
          <span className="d2-x font-display text-xs font-black text-gray-muted">x</span>
          <div className="d2-away-input h-10 w-10 border-2 border-border bg-transparent flex items-center justify-center font-display text-lg font-black text-black">
            <span className="d2-away-digit">{match.predictedAway}</span>
          </div>
        </div>
        <TeamSideAway name={match.away.name} flag={match.away.flag} />
      </div>
      <div className="d2-status mt-1 relative h-3.5">
        <span className="saved absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[9px] font-bold uppercase tracking-widest text-green whitespace-nowrap">
          Salvo
        </span>
      </div>
    </div>
  )
}

function TeamSideHome({ name, flag }: { name: string; flag: string }) {
  return (
    <div className="d2-side-home flex flex-1 items-center justify-end gap-1.5 min-w-0">
      <span className="d2-team-name truncate font-display text-xs font-bold uppercase tracking-wide text-black">
        {name}
      </span>
      <img className="d2-flag h-5 w-5 rounded-full object-cover shrink-0" src={flag} alt="" />
    </div>
  )
}

function TeamSideAway({ name, flag }: { name: string; flag: string }) {
  return (
    <div className="d2-side-away flex flex-1 items-center gap-1.5 min-w-0">
      <img className="d2-flag h-5 w-5 rounded-full object-cover shrink-0" src={flag} alt="" />
      <span className="d2-team-name truncate font-display text-xs font-bold uppercase tracking-wide text-black">
        {name}
      </span>
    </div>
  )
}

function ScoreLockedDisplay({ home, away }: { home: number; away: number }) {
  return (
    <div className="d2-score flex items-center gap-1 shrink-0">
      <div className="h-10 w-10 border-2 border-border/50 flex items-center justify-center font-display text-lg font-black text-gray-muted">
        {home}
      </div>
      <span className="font-display text-xs font-black text-gray-muted">x</span>
      <div className="h-10 w-10 border-2 border-border/50 flex items-center justify-center font-display text-lg font-black text-gray-muted">
        {away}
      </div>
    </div>
  )
}

function ToggleButton({
  initiallyExpanded,
  className = '',
}: {
  initiallyExpanded: boolean
  className?: string
}) {
  return (
    <div
      className={`d2-toggle mt-2 flex items-center justify-center gap-1.5 w-full font-display text-[10px] font-bold uppercase tracking-widest ${initiallyExpanded ? 'text-black' : 'text-gray-muted'} ${className}`}
    >
      <span className="d2-toggle-label relative inline-block">
        <span className="label-collapsed">Ver palpites dos oponentes</span>
        <span className="label-expanded">Ocultar palpites dos oponentes</span>
      </span>
      <span className="d2-toggle-arrow inline-block" style={{ transition: 'transform 200ms' }}>
        ▾
      </span>
    </div>
  )
}

export function DemoPredict() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          02 — Faça seus palpites
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          O ciclo completo.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Veja o resultado oficial (com seus pontos), acompanhe o jogo ao vivo (com o palpite da
          galera) e palpite os próximos jogos.
        </p>
      </div>
      <div
        ref={ref}
        className={`stage demo-d2 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="d2 flex flex-col gap-0">
          {DEMO_MATCHES.map((match, idx) => (
            <MatchRow key={match.id} match={match} idx={idx} />
          ))}
        </div>
      </div>
    </section>
  )
}
