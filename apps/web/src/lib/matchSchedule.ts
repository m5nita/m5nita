/**
 * Pure helpers for the "Jogos do dia" / "Todos os jogos" schedule views.
 * All day grouping is done in the viewer's local timezone, matching how match
 * kickoff times are already rendered (`formatDate`).
 */

function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Local-calendar-date key (`YYYY-MM-DD`) for an ISO timestamp — for grouping. */
export function localDayKey(iso: string): string {
  return dayKey(new Date(iso))
}

/** New array sorted ascending by `matchDate` (does not mutate the input). */
export function sortByDate<T extends { matchDate: string }>(matches: T[]): T[] {
  return [...matches].sort(
    (a, b) => new Date(a.matchDate).getTime() - new Date(b.matchDate).getTime(),
  )
}

/** Matches whose kickoff falls on the same local day as `now`, sorted by time. */
export function matchesToday<T extends { matchDate: string }>(matches: T[], now: Date): T[] {
  const today = dayKey(now)
  return sortByDate(matches.filter((m) => localDayKey(m.matchDate) === today))
}

/** Human day header, e.g. `"Qui · 11/06"`. */
export function formatDayHeader(iso: string): string {
  const d = new Date(iso)
  const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '')
  const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  return `${capitalized} · ${dayMonth}`
}

export type Grouping = 'matchday' | 'day' | 'none'

export interface SectionItem<T> {
  match: T
  /** Index in the full, ungrouped list — stable for refs / focus order. */
  originalIndex: number
  /** Index within this section — drives the two-column split + CSS order. */
  localIndex: number
}

export interface Section<T> {
  key: string
  header: string | null
  items: SectionItem<T>[]
}

function sectionMeta(
  match: { matchDate: string; matchday?: number | null },
  grouping: Grouping,
): { key: string; header: string | null } {
  if (grouping === 'day') {
    return { key: localDayKey(match.matchDate), header: formatDayHeader(match.matchDate) }
  }
  if (grouping === 'matchday') {
    const md = match.matchday ?? null
    return { key: String(md ?? 'none'), header: md && md > 0 ? `${md}ª Rodada` : 'Rodada' }
  }
  return { key: 'all', header: null }
}

/**
 * Split an ordered match list into consecutive sections by `grouping`. Items
 * keep their global `originalIndex` and a per-section `localIndex`.
 */
export function buildSections<T extends { matchDate: string; matchday?: number | null }>(
  matches: T[],
  grouping: Grouping,
): Section<T>[] {
  const sections: Section<T>[] = []
  matches.forEach((match, originalIndex) => {
    const { key, header } = sectionMeta(match, grouping)
    let current = sections[sections.length - 1]
    if (!current || current.key !== key) {
      current = { key, header, items: [] }
      sections.push(current)
    }
    current.items.push({ match, originalIndex, localIndex: current.items.length })
  })
  return sections
}

/** Number of pages needed for `total` items (never less than 1). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize))
}

/** The slice of `items` for a 1-based `page`. */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return items.slice(start, start + pageSize)
}

/**
 * For a chronologically-sorted list, the 1-based page holding the first match
 * that hasn't finished yet — so "Todos os jogos" opens near the live action
 * instead of the oldest results. Falls back to the last page when everything
 * is finished, and to page 1 when the list is empty.
 */
export function firstRelevantPage(matches: { status: string }[], pageSize: number): number {
  if (matches.length === 0) return 1
  const idx = matches.findIndex((m) => m.status !== 'finished')
  const targetIdx = idx === -1 ? matches.length - 1 : idx
  return Math.floor(targetIdx / pageSize) + 1
}
