import type { MatchPredictionsResponse, MatchPredictor, MatchStatus } from '@m5nita/shared'
import { useState } from 'react'

const NON_KNOCKOUT_STAGES = new Set(['group', 'league'])

interface MatchPredictionsListProps {
  data: MatchPredictionsResponse
  stage: string
  homeTeam: string
  awayTeam: string
}

function formatPoints(predictor: MatchPredictor, matchStatus: MatchStatus) {
  if (predictor.points === null) return null
  const baseClass = matchStatus === 'live' ? 'text-red' : 'text-green'
  const pulse = matchStatus === 'live'

  return {
    total: predictor.points === 1 ? '+1 pt' : `+${predictor.points} pts`,
    className: baseClass,
    pulse,
  }
}

function displayName(name: string | null) {
  return name && name.trim().length > 0 ? name : 'Sem nome'
}

function predictorAriaLabel(
  predictor: MatchPredictor,
  matchStatus: MatchStatus,
  pickedTeam?: string,
): string {
  const base = `${displayName(predictor.name)} palpitou ${predictor.homeScore} a ${predictor.awayScore}`
  const withTeam = pickedTeam ? `${base}, classifica ${pickedTeam}` : base
  if (predictor.points === null) return withTeam
  const unit = predictor.points === 1 ? 'ponto' : 'pontos'
  const qualifier = matchStatus === 'live' ? ' parciais' : ''
  return `${withTeam}, ${predictor.points} ${unit}${qualifier}`
}

function AdvancePickChip({
  pick,
  homeTeam,
  awayTeam,
}: {
  pick: 'home' | 'away' | null | undefined
  homeTeam: string
  awayTeam: string
}) {
  if (pick !== 'home' && pick !== 'away') return null
  const team = pick === 'home' ? homeTeam : awayTeam
  return (
    <span
      aria-hidden="true"
      className="flex max-w-full items-center border border-border/60 px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-gray-dark"
      title={`Classifica: ${team}`}
    >
      <span className="truncate">{team}</span>
    </span>
  )
}

function PointsLabel({
  total,
  advanceBonus,
  pulse,
}: {
  total: number
  advanceBonus: number
  pulse: boolean
}) {
  return (
    <span className="flex items-center gap-1">
      {pulse && <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />}
      <span>+{total - advanceBonus}</span>
      <span>+{advanceBonus}</span>
    </span>
  )
}

function PredictorRow({
  predictor,
  matchStatus,
  isKnockout,
  homeTeam,
  awayTeam,
}: {
  predictor: MatchPredictor
  matchStatus: MatchStatus
  isKnockout: boolean
  homeTeam: string
  awayTeam: string
}) {
  const points = formatPoints(predictor, matchStatus)
  const pickedTeam =
    isKnockout && predictor.advancePick === 'home'
      ? homeTeam
      : isKnockout && predictor.advancePick === 'away'
        ? awayTeam
        : undefined

  return (
    // Visual content is aria-hidden; the row's aria-label carries the full,
    // color-independent summary (incl. "parciais" for live) for screen readers.
    // Subgrid: each row shares the list's column tracks, so score/chip/points
    // line up across rows while every column shrinks to its content — no fixed
    // chip slot leaving a big empty gap before the points on narrow screens.
    <li
      className="col-span-full grid grid-cols-subgrid items-center gap-x-2 border-t border-border/60 py-2 first:border-t-0"
      aria-label={predictorAriaLabel(predictor, matchStatus, pickedTeam)}
    >
      <span
        aria-hidden="true"
        className="min-w-0 truncate font-display text-xs font-bold uppercase tracking-wide text-black"
      >
        {displayName(predictor.name)}
      </span>
      <div aria-hidden="true" className="flex items-center gap-1">
        <div className="flex h-8 w-8 items-center justify-center border-2 border-border/50 bg-transparent font-display text-base font-black text-gray-muted">
          {predictor.homeScore}
        </div>
        <span className="font-display text-[11px] font-black text-gray-muted">x</span>
        <div className="flex h-8 w-8 items-center justify-center border-2 border-border/50 bg-transparent font-display text-base font-black text-gray-muted">
          {predictor.awayScore}
        </div>
      </div>
      {isKnockout && (
        <div aria-hidden="true" className="flex min-w-0 justify-start">
          <AdvancePickChip pick={predictor.advancePick} homeTeam={homeTeam} awayTeam={awayTeam} />
        </div>
      )}
      <span
        aria-hidden="true"
        className={`flex items-center justify-end gap-1 whitespace-nowrap font-display text-xs font-black ${points?.className ?? ''}`}
      >
        {points &&
          ((predictor.advanceBonus ?? 0) > 0 ? (
            <PointsLabel
              total={predictor.points as number}
              advanceBonus={predictor.advanceBonus as number}
              pulse={points.pulse}
            />
          ) : (
            <>
              {points.pulse && (
                <span className="h-1 w-1 animate-pulse rounded-full bg-red" aria-hidden="true" />
              )}
              {points.total}
            </>
          ))}
      </span>
    </li>
  )
}

export function MatchPredictionsList({
  data,
  stage,
  homeTeam,
  awayTeam,
}: MatchPredictionsListProps) {
  const [showNonPredictors, setShowNonPredictors] = useState(false)

  const hasPredictors = data.predictors.length > 0
  const nonPredictorCount = data.nonPredictors.length
  const isKnockout = !NON_KNOCKOUT_STAGES.has(stage)

  return (
    <div className="-mx-5 mt-3 border-t border-border bg-black/2 px-5 pt-2 pb-1 lg:mx-0 lg:px-4">
      {hasPredictors ? (
        <ul
          className={`grid gap-x-2 ${
            isKnockout
              ? 'grid-cols-[minmax(0,1fr)_auto_auto_auto]'
              : 'grid-cols-[minmax(0,1fr)_auto_auto]'
          }`}
        >
          {data.predictors.map((predictor) => (
            <PredictorRow
              key={predictor.userId}
              predictor={predictor}
              matchStatus={data.matchStatus}
              isKnockout={isKnockout}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          ))}
        </ul>
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
