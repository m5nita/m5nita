import type { MatchPredictionsResponse, MatchPredictor, MatchStatus } from '@m5nita/shared'
import { useState } from 'react'

interface MatchPredictionsListProps {
  data: MatchPredictionsResponse
}

function formatPoints(points: number | null, matchStatus: MatchStatus) {
  if (points === null) return null
  const label = points === 1 ? '+1 pt' : `+${points} pts`
  const className = matchStatus === 'live' ? 'text-red' : 'text-green'
  return { label, className, pulse: matchStatus === 'live' }
}

function displayName(name: string | null) {
  return name && name.trim().length > 0 ? name : 'Sem nome'
}

function PredictorRow({
  predictor,
  matchStatus,
}: {
  predictor: MatchPredictor
  matchStatus: MatchStatus
}) {
  const points = formatPoints(predictor.points, matchStatus)
  return (
    <div className="flex items-center gap-2 py-2">
      <span className="flex-1 truncate font-display text-xs font-bold uppercase tracking-wide text-black">
        {displayName(predictor.name)}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <div className="flex h-8 w-8 items-center justify-center border-2 border-border/50 bg-transparent font-display text-base font-black text-gray-muted">
          {predictor.homeScore}
        </div>
        <span className="font-display text-[11px] font-black text-gray-muted">x</span>
        <div className="flex h-8 w-8 items-center justify-center border-2 border-border/50 bg-transparent font-display text-base font-black text-gray-muted">
          {predictor.awayScore}
        </div>
      </div>
      {points && (
        <span
          className={`shrink-0 flex min-w-[48px] items-center justify-end gap-1 font-display text-xs font-black ${points.className}`}
        >
          {points.pulse && (
            <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
          )}
          {points.label}
        </span>
      )}
    </div>
  )
}

export function MatchPredictionsList({ data }: MatchPredictionsListProps) {
  const [showNonPredictors, setShowNonPredictors] = useState(false)

  const hasPredictors = data.predictors.length > 0
  const nonPredictorCount = data.nonPredictors.length

  return (
    <div className="-mx-5 mt-3 border-t border-border bg-black/2 px-5 pt-2 pb-1 lg:mx-0 lg:px-4">
      {hasPredictors ? (
        <div className="divide-y divide-border/60">
          {data.predictors.map((predictor) => (
            <PredictorRow
              key={predictor.userId}
              predictor={predictor}
              matchStatus={data.matchStatus}
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-center font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
          Nenhum outro participante palpitou
        </p>
      )}

      {nonPredictorCount > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowNonPredictors((v) => !v)}
            aria-expanded={showNonPredictors}
            className="mt-2 flex w-full items-center justify-between border-t border-border/60 py-2 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted transition-colors hover:text-black"
          >
            <span>{nonPredictorCount} sem palpite</span>
            <span aria-hidden="true">{showNonPredictors ? '▴' : '▾'}</span>
          </button>
          {showNonPredictors && (
            <ul className="divide-y divide-border/60">
              {data.nonPredictors.map((member) => (
                <li
                  key={member.userId}
                  className="py-2 font-display text-xs font-bold uppercase tracking-wide text-gray-muted"
                >
                  {displayName(member.name)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
