import { describe, expect, it } from 'vitest'
import { matchParamsForPool } from './matchQuery'

describe('matchParamsForPool', () => {
  it('scopes a single-match pool to that match', () => {
    const params = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: 'match-9',
      matchdayFrom: null,
      matchdayTo: null,
    })
    expect(params.get('competitionId')).toBe('comp-1')
    expect(params.get('matchId')).toBe('match-9')
    expect(params.get('matchdayFrom')).toBeNull()
    expect(params.get('matchdayTo')).toBeNull()
  })

  it('scopes a matchday-range pool to its rounds', () => {
    const params = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: null,
      matchdayFrom: 5,
      matchdayTo: 10,
    })
    expect(params.get('competitionId')).toBe('comp-1')
    expect(params.get('matchdayFrom')).toBe('5')
    expect(params.get('matchdayTo')).toBe('10')
    expect(params.get('matchId')).toBeNull()
  })

  it('sends only the competition for a full-competition pool', () => {
    const params = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: null,
      matchdayFrom: null,
      matchdayTo: null,
    })
    expect(params.get('competitionId')).toBe('comp-1')
    expect([...params.keys()]).toEqual(['competitionId'])
  })

  it('treats a single-ended range as whole-competition (server scope must mirror the client AND filter)', () => {
    const fromOnly = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: null,
      matchdayFrom: 5,
      matchdayTo: null,
    })
    expect([...fromOnly.keys()]).toEqual(['competitionId'])

    const toOnly = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: null,
      matchdayFrom: null,
      matchdayTo: 10,
    })
    expect([...toOnly.keys()]).toEqual(['competitionId'])
  })

  it('matchId takes precedence over a matchday range (mutually exclusive scopes)', () => {
    const params = matchParamsForPool({
      competitionId: 'comp-1',
      matchId: 'match-9',
      matchdayFrom: 5,
      matchdayTo: 10,
    })
    expect(params.get('matchId')).toBe('match-9')
    expect(params.get('matchdayFrom')).toBeNull()
  })
})
