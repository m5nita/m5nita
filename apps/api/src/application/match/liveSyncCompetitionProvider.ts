import type { CallBudget } from '../../domain/shared/CallBudget'
import type { Clock } from '../../domain/shared/Clock'
import type { CompetitionInfo } from './SyncLiveScoresUseCase'

export type LiveSyncProviderDeps = {
  listActive: () => Promise<CompetitionInfo[]>
  findLiveOrImminentCompetitionIds: (now: Date) => Promise<string[]>
  budget: CallBudget
  clock: Clock
}

/**
 * Returns the `findActiveCompetitions` function the live-sync use case calls each
 * tick. It only yields competitions that actually have a live/imminent match
 * (every yielded competition costs one football-data call), ordered
 * least-recently-synced first, and capped to the remaining per-minute call
 * budget — so the sync stays within the football-data rate limit and degrades
 * by round-robin instead of overrunning it.
 */
export function createLiveSyncCompetitionProvider(
  deps: LiveSyncProviderDeps,
): () => Promise<CompetitionInfo[]> {
  const lastSyncedAt = new Map<string, number>()

  return async () => {
    const now = deps.clock.now()
    const liveOrImminent = new Set(await deps.findLiveOrImminentCompetitionIds(now))
    if (liveOrImminent.size === 0) return []

    const candidates = (await deps.listActive()).filter((c) => liveOrImminent.has(c.id))
    if (candidates.length === 0) return []

    // Least-recently-synced first so that, when the budget can't cover them all
    // this tick, the ones skipped last tick get priority next tick.
    candidates.sort(
      (a, b) =>
        (lastSyncedAt.get(a.id) ?? Number.NEGATIVE_INFINITY) -
        (lastSyncedAt.get(b.id) ?? Number.NEGATIVE_INFINITY),
    )

    const affordable = deps.budget.take(candidates.length)
    const chosen = candidates.slice(0, affordable)
    if (chosen.length < candidates.length) {
      console.warn(
        `[LiveSync] call budget: syncing ${chosen.length}/${candidates.length} live/imminent competitions this tick`,
      )
    }

    const nowMs = now.getTime()
    for (const c of chosen) lastSyncedAt.set(c.id, nowMs)
    return chosen
  }
}
