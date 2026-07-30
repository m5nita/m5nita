import { describe, expect, it } from 'vitest'
import { MatchdayRange } from './MatchdayRange'
import { PoolScope } from './PoolScope'

const MATCH_A = '11111111-1111-4111-8111-111111111111'
const MATCH_B = '22222222-2222-4222-8222-222222222222'

describe('PoolScope', () => {
  describe('factories', () => {
    it('wholeCompetition() builds a kind="whole-competition" scope', () => {
      const scope = PoolScope.wholeCompetition()
      expect(scope.kind).toBe('whole-competition')
      expect(scope.range).toBeNull()
      expect(scope.matchId).toBeNull()
    })

    it('fromRange() builds a kind="range" scope', () => {
      const range = MatchdayRange.create(1, 5) as MatchdayRange
      const scope = PoolScope.fromRange(range)
      expect(scope.kind).toBe('range')
      expect(scope.range).toBe(range)
      expect(scope.matchId).toBeNull()
    })

    it('singleMatch() builds a kind="single-match" scope', () => {
      const scope = PoolScope.singleMatch(MATCH_A)
      expect(scope.kind).toBe('single-match')
      expect(scope.range).toBeNull()
      expect(scope.matchId).toBe(MATCH_A)
    })

    it('singleMatch() rejects non-UUID input', () => {
      expect(() => PoolScope.singleMatch('not-a-uuid')).toThrow('valid UUID')
      expect(() => PoolScope.singleMatch('')).toThrow('valid UUID')
    })
  })

  describe('fromRow()', () => {
    it('returns whole-competition when all three fields are null', () => {
      const scope = PoolScope.fromRow({ matchdayFrom: null, matchdayTo: null, matchId: null })
      expect(scope.kind).toBe('whole-competition')
    })

    it('returns range when only the matchday fields are present', () => {
      const scope = PoolScope.fromRow({ matchdayFrom: 3, matchdayTo: 5, matchId: null })
      expect(scope.kind).toBe('range')
      expect(scope.range?.from).toBe(3)
      expect(scope.range?.to).toBe(5)
    })

    it('returns single-match when only matchId is present', () => {
      const scope = PoolScope.fromRow({ matchdayFrom: null, matchdayTo: null, matchId: MATCH_A })
      expect(scope.kind).toBe('single-match')
      expect(scope.matchId).toBe(MATCH_A)
    })

    it('throws when both matchId and a matchday field are present', () => {
      expect(() => PoolScope.fromRow({ matchdayFrom: 3, matchdayTo: 5, matchId: MATCH_A })).toThrow(
        'cannot have both',
      )
      expect(() =>
        PoolScope.fromRow({ matchdayFrom: 3, matchdayTo: null, matchId: MATCH_A }),
      ).toThrow('cannot have both')
    })
  })

  describe('contains()', () => {
    it('whole-competition matches any match', () => {
      const scope = PoolScope.wholeCompetition()
      expect(scope.contains({ id: MATCH_A, matchday: 1 })).toBe(true)
      expect(scope.contains({ id: MATCH_B, matchday: null })).toBe(true)
    })

    it('range matches matchdays within the range and rejects nulls', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(3, 5) as MatchdayRange)
      expect(scope.contains({ id: MATCH_A, matchday: 3 })).toBe(true)
      expect(scope.contains({ id: MATCH_A, matchday: 5 })).toBe(true)
      expect(scope.contains({ id: MATCH_A, matchday: 6 })).toBe(false)
      expect(scope.contains({ id: MATCH_A, matchday: null })).toBe(false)
    })

    it('single-match matches only the chosen match id', () => {
      const scope = PoolScope.singleMatch(MATCH_A)
      expect(scope.contains({ id: MATCH_A, matchday: null })).toBe(true)
      expect(scope.contains({ id: MATCH_A, matchday: 9 })).toBe(true)
      expect(scope.contains({ id: MATCH_B, matchday: 9 })).toBe(false)
    })
  })

  describe('singleMatchIdOrNull()', () => {
    it('returns the matchId for single-match scopes', () => {
      expect(PoolScope.singleMatch(MATCH_A).singleMatchIdOrNull()).toBe(MATCH_A)
    })

    it('returns null for range and whole-competition scopes', () => {
      expect(PoolScope.wholeCompetition().singleMatchIdOrNull()).toBeNull()
      expect(
        PoolScope.fromRange(MatchdayRange.create(1, 3) as MatchdayRange).singleMatchIdOrNull(),
      ).toBeNull()
    })
  })
  describe('label()', () => {
    it('names a whole-competition scope', () => {
      expect(PoolScope.wholeCompetition().label()).toBe('Campeonato completo')
    })

    it('names a single matchday in the singular', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(5, 5) as MatchdayRange)
      expect(scope.label()).toBe('Rodada 5')
    })

    it('names a multi-matchday range', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(5, 8) as MatchdayRange)
      expect(scope.label()).toBe('Rodadas 5 a 8')
    })

    it('names a single-match scope by its fixture when one is given', () => {
      const scope = PoolScope.singleMatch(MATCH_A)
      expect(scope.label({ homeTeam: 'Flamengo', awayTeam: 'Palmeiras' })).toBe(
        'Flamengo x Palmeiras',
      )
    })

    it('degrades to a generic label when the fixture cannot be resolved', () => {
      const scope = PoolScope.singleMatch(MATCH_A)
      expect(scope.label()).toBe('Jogo único')
      expect(scope.label(null)).toBe('Jogo único')
    })

    it('ignores a fixture passed for a non-single-match scope', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(1, 2) as MatchdayRange)
      expect(scope.label({ homeTeam: 'A', awayTeam: 'B' })).toBe('Rodadas 1 a 2')
    })
  })

  describe('supportsParticipantStats()', () => {
    it('is true only for a whole-competition scope', () => {
      expect(PoolScope.wholeCompetition().supportsParticipantStats()).toBe(true)
    })

    it('is false for a single matchday', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(5, 5) as MatchdayRange)
      expect(scope.supportsParticipantStats()).toBe(false)
    })

    it('is false for a matchday range', () => {
      const scope = PoolScope.fromRange(MatchdayRange.create(1, 8) as MatchdayRange)
      expect(scope.supportsParticipantStats()).toBe(false)
    })

    it('is false for a single match', () => {
      expect(PoolScope.singleMatch(MATCH_A).supportsParticipantStats()).toBe(false)
    })
  })
})
