import { describe, expect, it } from 'vitest'
import { ClimbPolicy, type PendingMatchInput } from './ClimbPolicy'
import type { PoolStatsAggregateRow } from './StatsRepository.port'

function row(
  userId: string,
  pointsTotal: number,
  opts: { name?: string | null; finished?: number; exact?: number } = {},
): PoolStatsAggregateRow {
  return {
    userId,
    displayName: opts.name === undefined ? userId : opts.name,
    finishedCount: opts.finished ?? 5,
    exactCount: opts.exact ?? 0,
    resultCount: 0,
    pointsTotal,
  }
}

const STANDINGS: PoolStatsAggregateRow[] = [
  row('lead', 142, { name: 'Ana' }),
  row('carlos', 137, { name: 'Carlos' }),
  row('bia', 134, { name: 'Bia' }),
  row('me', 128, { name: 'Você' }),
  row('diego', 124, { name: 'Diego' }),
]

const D1 = new Date('2026-06-20T19:00:00Z')
const D2 = new Date('2026-06-21T19:00:00Z')

function pending(over: Partial<PendingMatchInput> = {}): PendingMatchInput {
  return {
    matchId: 'mx',
    homeTeam: 'Flamengo',
    awayTeam: 'Palmeiras',
    matchDate: D1,
    hasPrediction: false,
    ...over,
  }
}

function build(
  over: {
    aggregate?: PoolStatsAggregateRow[]
    viewerUserId?: string
    maxPoints?: number
    pendingMatches?: PendingMatchInput[]
  } = {},
) {
  return ClimbPolicy.build({
    aggregate: over.aggregate ?? STANDINGS,
    viewerUserId: over.viewerUserId ?? 'me',
    maxPoints: over.maxPoints ?? 10,
    pendingMatches: over.pendingMatches ?? [],
  })
}

describe('ClimbPolicy.build', () => {
  it('mid_pack_gap_chaser_and_position', () => {
    const c = build()
    expect(c.position).toBe(4)
    expect(c.memberCount).toBe(5)
    expect(c.leads).toBe(false)
    expect(c.nextUp).toEqual({ gap: 6, exactsToClose: 1 }) // 134 - 128
    expect(c.chaser?.name).toBe('Diego')
    expect(c.chaser?.gap).toBe(4) // 128 - 124
    expect(c.chaser?.close).toBe(true) // 4 <= 10
    expect(c.state).toBe('ok')
  })

  it('leader_has_no_nextUp_and_leads', () => {
    const c = build({ viewerUserId: 'lead' })
    expect(c.position).toBe(1)
    expect(c.leads).toBe(true)
    expect(c.nextUp).toBeNull()
    expect(c.chaser?.name).toBe('Carlos')
  })

  it('last_place_has_no_chaser', () => {
    const c = build({ viewerUserId: 'diego' })
    expect(c.position).toBe(5)
    expect(c.chaser).toBeNull()
    expect(c.nextUp).toEqual({ gap: 4, exactsToClose: 1 }) // 128 - 124
  })

  it('exacts_to_close_ceils_to_whole_matches', () => {
    const agg = [row('above', 139), row('me', 128)]
    expect(build({ aggregate: agg }).nextUp).toEqual({ gap: 11, exactsToClose: 2 }) // ceil(11/10)
  })

  it('chaser_close_flag_false_when_gap_exceeds_one_match', () => {
    const agg = [row('me', 128), row('far', 110, { name: 'Rafa' })]
    const c = build({ aggregate: agg })
    expect(c.chaser?.gap).toBe(18)
    expect(c.chaser?.close).toBe(false)
  })

  it('chaser_name_passes_through_null', () => {
    const agg = [row('me', 128), row('anon', 120, { name: null })]
    expect(build({ aggregate: agg }).chaser?.name).toBeNull()
  })

  it('insufficient_when_viewer_has_no_finished_matches', () => {
    const agg = [row('me', 0, { finished: 0 }), row('x', 40)]
    const c = build({ aggregate: agg, pendingMatches: [pending()] })
    expect(c.state).toBe('insufficient_data')
    expect(c.position).toBeNull()
    expect(c.nextUp).toBeNull()
    expect(c.nextMatch).not.toBeNull() // a brand-new player still sees their next game
  })

  it('insufficient_when_viewer_absent_from_standings', () => {
    const c = build({ viewerUserId: 'ghost' })
    expect(c.state).toBe('insufficient_data')
    expect(c.position).toBeNull()
  })

  it('next_match_is_the_earliest_pending_with_submit_action', () => {
    const c = build({
      pendingMatches: [
        pending({ matchId: 'later', matchDate: D2 }),
        pending({ matchId: 'soon', matchDate: D1, hasPrediction: false }),
      ],
    })
    expect(c.nextMatch?.matchId).toBe('soon')
    expect(c.nextMatch?.action).toBe('submit')
    expect(c.nextMatch?.kickoff).toBe(D1.toISOString())
  })

  it('next_match_change_action_when_already_predicted', () => {
    const c = build({ pendingMatches: [pending({ hasPrediction: true })] })
    expect(c.nextMatch?.action).toBe('change')
  })

  it('no_pending_matches_gives_null_next_match', () => {
    expect(build({ pendingMatches: [] }).nextMatch).toBeNull()
  })
})
