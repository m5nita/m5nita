import type { PoolRepository, PoolWithDetails } from '../../domain/pool/PoolRepository.port'
import { PoolScope } from '../../domain/shared/PoolScope'
import type { NewPoolData, NotificationService } from '../ports/NotificationService.port'
import type { UserDirectory } from '../ports/UserDirectory.port'

/** Narrow read used only to name a single-match pool's fixture in the copy. */
export type FixtureFinder = (
  matchId: string,
) => Promise<{ homeTeam: string; awayTeam: string } | null>

type Input = {
  poolId: string
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'Alguém'
}

/**
 * Tells the whole base about a pool that just went live, when its creator asked
 * for it. Invoked after the entry payment is confirmed and committed — never
 * before, or people would be invited to a pool that may never be paid for.
 *
 * Deciding *who* and *what* is this use case's job; picking a channel and
 * honouring each person's preferences belongs to the notification adapter.
 */
export class AnnounceNewPoolUseCase {
  constructor(
    private readonly poolRepo: PoolRepository,
    private readonly users: UserDirectory,
    private readonly notifications: NotificationService,
    private readonly findFixture: FixtureFinder,
  ) {}

  async execute(input: Input): Promise<void> {
    const pool = await this.poolRepo.findByIdWithDetails(input.poolId)
    if (!pool?.notifyOnCreate) return

    const recipients = await this.users.listAllExcept(pool.ownerId)
    if (recipients.length === 0) return

    await this.notifications.notifyNewPool(await this.buildPayload(pool, recipients))
  }

  private async buildPayload(
    pool: PoolWithDetails,
    recipients: NewPoolData['recipients'],
  ): Promise<NewPoolData> {
    return {
      poolId: pool.id,
      poolName: pool.name,
      inviteCode: pool.inviteCode,
      competitionName: pool.competitionName,
      scopeLabel: await this.scopeLabel(pool),
      entryFee: pool.entryFee,
      creatorFirstName: firstNameOf(pool.owner.name),
      recipients,
    }
  }

  // A missing or unreachable fixture must not stop the announcement: the scope
  // wording simply degrades to its generic form.
  private async scopeLabel(pool: PoolWithDetails): Promise<string> {
    const scope = PoolScope.fromRow(pool)
    const matchId = scope.singleMatchIdOrNull()
    if (!matchId) return scope.label()
    const fixture = await this.findFixture(matchId).catch(() => null)
    return scope.label(fixture)
  }
}
