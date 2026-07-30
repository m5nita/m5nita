/** A registered user, reduced to what a broadcast needs to reach them. */
export interface BroadcastRecipient {
  userId: string
  phoneNumber: string | null
}

/**
 * Read-side access to the user base for notifications addressed to everyone.
 * Kept separate from the auth concern: this port answers "who could I reach",
 * not "who is this".
 */
export interface UserDirectory {
  /** Every registered user except the given one, in no particular order. */
  listAllExcept(userId: string): Promise<BroadcastRecipient[]>
}
