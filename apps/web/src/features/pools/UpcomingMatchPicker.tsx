import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../../lib/api'
import { stageLabel } from '../competitions/stageLabels'

export interface UpcomingMatch {
  id: string
  matchday: number | null
  stage: string | null
  kickoffAt: string
  homeTeam: { name: string; crest: string }
  awayTeam: { name: string; crest: string }
  status: string
}

interface UpcomingMatchPickerProps {
  competitionId: string
  value: string
  onChange: (matchId: string) => void
}

async function fetchUpcoming(competitionId: string): Promise<UpcomingMatch[]> {
  const res = await apiFetch(`/api/competitions/${competitionId}/upcoming-matches`)
  if (!res.ok) throw new Error(`Failed to load upcoming matches (${res.status})`)
  const data = (await res.json()) as { matches: UpcomingMatch[] }
  return data.matches
}

function groupLabel(m: UpcomingMatch): string {
  if (m.matchday != null) return `Rodada ${m.matchday}`
  return stageLabel(m.stage)
}

function formatKickoff(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function UpcomingMatchPicker({ competitionId, value, onChange }: UpcomingMatchPickerProps) {
  const query = useQuery({
    queryKey: ['upcoming-matches', competitionId],
    queryFn: () => fetchUpcoming(competitionId),
    enabled: !!competitionId,
    staleTime: 30_000,
  })

  // Collapse the list once a match is chosen; expose a "Trocar" button to reopen.
  // Re-expand whenever the selection is cleared so users searching for another
  // match aren't stuck on a stale collapsed summary.
  const [expanded, setExpanded] = useState(value === '')
  useEffect(() => {
    if (!value) setExpanded(true)
  }, [value])

  const selected = useMemo(
    () => (query.data ?? []).find((m) => m.id === value) ?? null,
    [query.data, value],
  )

  const grouped = useMemo(() => {
    const groups = new Map<string, UpcomingMatch[]>()
    for (const m of query.data ?? []) {
      const key = groupLabel(m) || 'Outras partidas'
      const arr = groups.get(key) ?? []
      arr.push(m)
      groups.set(key, arr)
    }
    return Array.from(groups.entries())
  }, [query.data])

  if (query.isLoading) {
    return <p className="text-xs text-gray-muted">Carregando jogos…</p>
  }
  if (query.isError) {
    return <p className="text-xs text-red">Não foi possível carregar os jogos.</p>
  }
  if ((query.data ?? []).length === 0) {
    return (
      <p className="text-xs text-gray-muted">Nenhum jogo futuro disponível para esta competição.</p>
    )
  }

  if (selected && !expanded) {
    return (
      <div className="flex items-center justify-between border-2 border-black bg-cream px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-black">
            {selected.homeTeam.name} × {selected.awayTeam.name}
          </span>
          <span className="text-xs text-gray-muted">
            {groupLabel(selected)} · {formatKickoff(selected.kickoffAt)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="font-display text-xs font-semibold uppercase tracking-wider text-gray-dark underline hover:text-black"
        >
          Trocar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(([label, matches]) => (
        <fieldset key={label} className="flex flex-col gap-1.5">
          <legend className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
            {label}
          </legend>
          <div className="flex flex-col gap-1.5">
            {matches.map((m) => {
              const id = `match-${m.id}`
              return (
                <label
                  key={m.id}
                  htmlFor={id}
                  className={`flex cursor-pointer items-center gap-3 border-2 px-3 py-2 transition-colors ${
                    value === m.id
                      ? 'border-black bg-cream'
                      : 'border-border hover:border-gray-muted'
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="single-match"
                    value={m.id}
                    checked={value === m.id}
                    onChange={() => {
                      onChange(m.id)
                      setExpanded(false)
                    }}
                    className="h-4 w-4"
                  />
                  <span className="flex-1 truncate text-sm text-black">
                    {m.homeTeam.name} × {m.awayTeam.name}
                  </span>
                  <span className="text-xs text-gray-muted">{formatKickoff(m.kickoffAt)}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
