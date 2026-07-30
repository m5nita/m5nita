import { NotificationError } from '../../domain/notification/NotificationError'
import {
  type NotificationPreferenceEntry,
  NotificationPreferences,
} from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'

type Input = {
  userId: string
  code: string
  enabled: boolean
}

type Output = {
  types: NotificationPreferenceEntry[]
}

/**
 * Changes one notification type for one user and returns the refreshed list, so
 * the client replaces its state in a single round trip.
 *
 * The code is validated against the catalog rather than a hardcoded list: a
 * newly seeded type is immediately togglable without a deploy.
 */
export class UpdateNotificationPreferencesUseCase {
  constructor(private readonly preferences: NotificationPreferencesRepository) {}

  async execute(input: Input): Promise<Output> {
    const types = await this.preferences.listTypes()
    const type = NotificationPreferences.of(types, {}).find(input.code)
    if (!type) {
      throw new NotificationError('UNKNOWN_TYPE', 'Tipo de notificação desconhecido')
    }

    // Enabling a locked type is accepted as a no-op (it is already the effective
    // state), so an idempotent client retry cannot fail. Disabling is refused.
    if (!type.canBeDisabled()) {
      if (!input.enabled) {
        throw new NotificationError('TYPE_LOCKED', 'Este aviso não pode ser desativado')
      }
      return this.currentList(input.userId, types)
    }

    await this.preferences.upsert(input.userId, input.code, input.enabled)
    return this.currentList(input.userId, types)
  }

  private async currentList(
    userId: string,
    types: Awaited<ReturnType<NotificationPreferencesRepository['listTypes']>>,
  ): Promise<Output> {
    const overrides = await this.preferences.findOverrides(userId)
    return { types: NotificationPreferences.of(types, overrides).list() }
  }
}
