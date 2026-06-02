type PoolScope = {
  competitionId: string
  matchId: string | null
  matchdayFrom: number | null
  matchdayTo: number | null
}

/**
 * Build the /api/matches query for a pool's scope so the server returns only
 * the matches the pool covers (one match, a round range, or the whole
 * competition) instead of every match in the competition. matchId and the
 * matchday range are mutually exclusive (see the pool scope CHECK constraint),
 * so matchId wins when both happen to be present.
 */
export function matchParamsForPool(pool: PoolScope): URLSearchParams {
  const params = new URLSearchParams()
  params.set('competitionId', pool.competitionId)

  if (pool.matchId != null) {
    params.set('matchId', pool.matchId)
    return params
  }
  // Only scope to a range when BOTH bounds exist — the client filter
  // (predictions.tsx) applies a matchday filter only when from AND to are set,
  // so a single-ended bound must fall back to whole-competition to stay in sync.
  if (pool.matchdayFrom != null && pool.matchdayTo != null) {
    params.set('matchdayFrom', String(pool.matchdayFrom))
    params.set('matchdayTo', String(pool.matchdayTo))
  }
  return params
}
