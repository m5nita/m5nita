import type { NotificationType } from './NotificationType'

/** A user's stored choices, keyed by type code. Absent key = never chose. */
export type NotificationOverrides = Readonly<Record<string, boolean>>

export type NotificationPreferenceEntry = {
  code: string
  label: string
  description: string
  enabled: boolean
  optOutable: boolean
}

/**
 * What one user receives: the catalog resolved against that user's overrides.
 *
 * A code the catalog does not describe resolves to "allowed". Failing open is
 * deliberate — a missing catalog row must surface as an unexpected notification,
 * never as a notification that silently stopped being sent.
 */
export class NotificationPreferences {
  private constructor(
    private readonly types: readonly NotificationType[],
    private readonly overrides: NotificationOverrides,
  ) {}

  static of(
    types: readonly NotificationType[],
    overrides: NotificationOverrides,
  ): NotificationPreferences {
    const ordered = [...types].sort((a, b) => a.sortOrder - b.sortOrder)
    return new NotificationPreferences(ordered, overrides)
  }

  allows(code: string): boolean {
    const type = this.find(code)
    if (!type) return true
    return type.resolveEnabled(this.overrides[code])
  }

  find(code: string): NotificationType | null {
    return this.types.find((type) => type.code === code) ?? null
  }

  list(): NotificationPreferenceEntry[] {
    return this.types.map((type) => ({
      code: type.code,
      label: type.label,
      description: type.description,
      enabled: type.resolveEnabled(this.overrides[type.code]),
      optOutable: type.optOutable,
    }))
  }
}
