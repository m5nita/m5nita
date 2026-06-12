import { describe, expect, it } from 'vitest'
import {
  buildSections,
  firstRelevantPage,
  formatDayHeader,
  localDayKey,
  matchesToday,
  pageCount,
  paginate,
  sortByDate,
} from './matchSchedule'

type M = { id: string; matchDate: string }

// Build an ISO string from a *local* calendar moment so the round-trip through
// the local-timezone helpers is deterministic regardless of where tests run.
function iso(y: number, mo: number, d: number, h = 12, mi = 0): string {
  return new Date(y, mo - 1, d, h, mi).toISOString()
}

describe('sortByDate', () => {
  it('sorts ascending by matchDate without mutating the input', () => {
    const a: M = { id: 'a', matchDate: iso(2026, 6, 13, 16) }
    const b: M = { id: 'b', matchDate: iso(2026, 6, 11, 13) }
    const c: M = { id: 'c', matchDate: iso(2026, 6, 11, 16) }
    const input = [a, b, c]

    const out = sortByDate(input)

    expect(out.map((m) => m.id)).toEqual(['b', 'c', 'a'])
    expect(input.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('matchesToday', () => {
  const now = new Date(2026, 5, 11, 14, 30) // June 11 2026, local

  it('returns only matches on the same local calendar day, sorted by time', () => {
    const earlierToday: M = { id: 'e', matchDate: iso(2026, 6, 11, 9) }
    const laterToday: M = { id: 'l', matchDate: iso(2026, 6, 11, 21) }
    const yesterday: M = { id: 'y', matchDate: iso(2026, 6, 10, 23) }
    const tomorrow: M = { id: 't', matchDate: iso(2026, 6, 12, 1) }

    const out = matchesToday([laterToday, yesterday, earlierToday, tomorrow], now)

    expect(out.map((m) => m.id)).toEqual(['e', 'l'])
  })

  it('returns empty when nothing falls on today', () => {
    expect(matchesToday([{ id: 'y', matchDate: iso(2026, 6, 10, 23) }], now)).toEqual([])
  })
})

describe('localDayKey', () => {
  it('keys by the local calendar date', () => {
    expect(localDayKey(iso(2026, 6, 11, 16))).toBe('2026-06-11')
  })

  it('groups two same-day matches under one key', () => {
    expect(localDayKey(iso(2026, 6, 11, 9))).toBe(localDayKey(iso(2026, 6, 11, 23)))
  })
})

describe('formatDayHeader', () => {
  it('includes the zero-padded day and month', () => {
    expect(formatDayHeader(iso(2026, 6, 11, 16))).toContain('11/06')
  })
})

describe('buildSections', () => {
  it('puts everything in one unlabeled section when grouping is none', () => {
    const ms: M[] = [
      { id: 'a', matchDate: iso(2026, 6, 11, 9) },
      { id: 'b', matchDate: iso(2026, 6, 12, 9) },
    ]

    const out = buildSections(ms, 'none')

    expect(out).toHaveLength(1)
    expect(out[0]?.header).toBeNull()
    expect(out[0]?.items.map((i) => i.match.id)).toEqual(['a', 'b'])
    expect(out[0]?.items.map((i) => i.localIndex)).toEqual([0, 1])
    expect(out[0]?.items.map((i) => i.originalIndex)).toEqual([0, 1])
  })

  it('groups consecutive matches by local day with day headers', () => {
    const ms: M[] = [
      { id: 'a', matchDate: iso(2026, 6, 11, 9) },
      { id: 'b', matchDate: iso(2026, 6, 11, 21) },
      { id: 'c', matchDate: iso(2026, 6, 12, 16) },
    ]

    const out = buildSections(ms, 'day')

    expect(out.map((s) => s.items.map((i) => i.match.id))).toEqual([['a', 'b'], ['c']])
    expect(out[0]?.header).toContain('11/06')
    expect(out[1]?.header).toContain('12/06')
    // localIndex resets per section; originalIndex stays global.
    expect(out[1]?.items[0]?.localIndex).toBe(0)
    expect(out[1]?.items[0]?.originalIndex).toBe(2)
  })

  it('groups by matchday with ordinal headers', () => {
    const ms: (M & { matchday: number })[] = [
      { id: 'a', matchDate: iso(2026, 6, 11, 9), matchday: 1 },
      { id: 'b', matchDate: iso(2026, 6, 12, 9), matchday: 1 },
      { id: 'c', matchDate: iso(2026, 6, 18, 9), matchday: 2 },
    ]

    const out = buildSections(ms, 'matchday')

    expect(out.map((s) => s.header)).toEqual(['1ª Rodada', '2ª Rodada'])
    expect(out.map((s) => s.items.map((i) => i.match.id))).toEqual([['a', 'b'], ['c']])
  })
})

describe('paginate / pageCount', () => {
  const items = Array.from({ length: 25 }, (_, i) => i)

  it('returns the slice for a 1-based page', () => {
    expect(paginate(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(paginate(items, 3, 10)).toEqual([20, 21, 22, 23, 24])
  })

  it('computes the page count with a floor of 1', () => {
    expect(pageCount(25, 10)).toBe(3)
    expect(pageCount(10, 10)).toBe(1)
    expect(pageCount(0, 10)).toBe(1)
  })
})

describe('firstRelevantPage', () => {
  it('returns 1 for an empty list', () => {
    expect(firstRelevantPage([], 10)).toBe(1)
  })

  it('lands on the page holding the first not-finished match', () => {
    const ms = Array.from({ length: 25 }, (_, i) => ({
      status: i < 12 ? 'finished' : 'scheduled',
    }))
    // first non-finished is index 12 -> floor(12/10)+1 = 2
    expect(firstRelevantPage(ms, 10)).toBe(2)
  })

  it('falls back to the last page when every match is finished', () => {
    const ms = Array.from({ length: 15 }, () => ({ status: 'finished' }))
    expect(firstRelevantPage(ms, 10)).toBe(2)
  })
})
