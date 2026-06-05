const NON_KNOCKOUT_STAGES = new Set(['group', 'league'])

/**
 * A match is "knockout" — eligible for an advance pick and the penalty bonus —
 * when its stage is eliminatory (anything other than group or league). Known
 * before kickoff from the stored stage; includes the third-place playoff.
 */
export function isKnockout(stage: string): boolean {
  return !NON_KNOCKOUT_STAGES.has(stage)
}
