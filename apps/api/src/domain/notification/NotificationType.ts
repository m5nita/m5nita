/**
 * The notification types the application code sends. This union exists for
 * call-site type safety only — the catalog in the database is the source of
 * truth for what a user can toggle, and it may legitimately hold codes this
 * union has never heard of (a newly seeded type must show up in settings
 * without a deploy).
 */
export const NOTIFICATION_TYPE_CODES = [
  'new_pool',
  'prediction_reminder',
  'match_points',
  'pool_result',
  'withdrawal_paid',
] as const

export type NotificationTypeCode = (typeof NOTIFICATION_TYPE_CODES)[number]

export type NotificationTypeAttributes = {
  code: string
  label: string
  description: string
  optOutable: boolean
  defaultEnabled: boolean
  sortOrder: number
}

/**
 * One catalog entry, with the rule that decides whether it reaches a user.
 *
 * The "cannot be silenced" guarantee lives here rather than in a database
 * constraint: a row saying `enabled = false` for a locked type — left behind if
 * a type is ever locked after the fact — must not suppress a prize notification.
 */
export class NotificationType {
  private constructor(
    readonly code: string,
    readonly label: string,
    readonly description: string,
    readonly optOutable: boolean,
    readonly defaultEnabled: boolean,
    readonly sortOrder: number,
  ) {}

  static of(attributes: NotificationTypeAttributes): NotificationType {
    const code = attributes.code.trim()
    if (!code) throw new Error('NotificationType code is required')
    if (!attributes.label.trim()) throw new Error('NotificationType label is required')
    return new NotificationType(
      code,
      attributes.label,
      attributes.description,
      attributes.optOutable,
      attributes.defaultEnabled,
      attributes.sortOrder,
    )
  }

  /** `override` is the user's stored choice, or undefined when they never chose. */
  resolveEnabled(override: boolean | undefined): boolean {
    if (!this.optOutable) return true
    return override ?? this.defaultEnabled
  }

  canBeDisabled(): boolean {
    return this.optOutable
  }
}
