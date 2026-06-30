import type { MatchRepository } from '../../domain/match/MatchRepository.port'
import { isKnockout } from '../../domain/match/MatchStage'

export type FinalizeMatchDeps = {
  matchRepo: MatchRepository
  /** Recompute points + standings + notifications for the match (the onMatchFinished pair). */
  rescore: (matchId: string) => Promise<void>
}

const VALID_WINNERS = ['home', 'away', 'draw'] as const
type Winner = (typeof VALID_WINNERS)[number]

function isWinner(value: string): value is Winner {
  return (VALID_WINNERS as readonly string[]).includes(value)
}

/**
 * Admin action: set a match's winner, mark it finished, and re-run scoring.
 * Resolves a match held without a winner, and doubles as a correction tool
 * (re-finalizing with a different winner re-scores from current state). Idempotent.
 */
export class FinalizeMatchUseCase {
  constructor(private readonly deps: FinalizeMatchDeps) {}

  async execute(matchId: string, winner: string): Promise<void> {
    if (!isWinner(winner)) throw new Error('INVALID_WINNER')

    const match = await this.deps.matchRepo.findById(matchId)
    if (!match) throw new Error('MATCH_NOT_FOUND')
    if (winner === 'draw' && isKnockout(match.stage)) throw new Error('KNOCKOUT_CANNOT_DRAW')

    await this.deps.matchRepo.finalizeWithWinner(matchId, winner)
    await this.deps.rescore(matchId)
  }
}
