import { describe, expect, it } from 'vitest'
import { NotificationPreferences } from './NotificationPreferences'
import { NotificationType } from './NotificationType'

const NEW_POOL = NotificationType.of({
  code: 'new_pool',
  label: 'Novos bolões',
  description: 'Avisos de bolão novo.',
  optOutable: true,
  defaultEnabled: true,
  sortOrder: 1,
})

const REMINDER = NotificationType.of({
  code: 'prediction_reminder',
  label: 'Lembretes de palpite',
  description: 'Aviso de jogo perto de começar.',
  optOutable: true,
  defaultEnabled: false,
  sortOrder: 2,
})

const LOCKED = NotificationType.of({
  code: 'pool_result',
  label: 'Prêmio disponível',
  description: 'Aviso de prêmio para saque.',
  optOutable: false,
  defaultEnabled: true,
  sortOrder: 3,
})

const CATALOG = [LOCKED, REMINDER, NEW_POOL]

describe('NotificationPreferences', () => {
  describe('allows()', () => {
    it('uses the catalog default when the user has no override', () => {
      const prefs = NotificationPreferences.of(CATALOG, {})
      expect(prefs.allows('new_pool')).toBe(true)
      expect(prefs.allows('prediction_reminder')).toBe(false)
    })

    it('uses the override when the user chose', () => {
      const prefs = NotificationPreferences.of(CATALOG, {
        new_pool: false,
        prediction_reminder: true,
      })
      expect(prefs.allows('new_pool')).toBe(false)
      expect(prefs.allows('prediction_reminder')).toBe(true)
    })

    it('ignores a stored false for a locked type', () => {
      const prefs = NotificationPreferences.of(CATALOG, { pool_result: false })
      expect(prefs.allows('pool_result')).toBe(true)
    })

    it('delivers a code the catalog does not describe, rather than silently dropping it', () => {
      const prefs = NotificationPreferences.of(CATALOG, {})
      expect(prefs.allows('code_that_is_not_seeded')).toBe(true)
    })
  })

  describe('list()', () => {
    it('is ordered by the catalog display order, with resolved states', () => {
      const prefs = NotificationPreferences.of(CATALOG, {
        new_pool: false,
        pool_result: false,
      })
      expect(prefs.list()).toEqual([
        {
          code: 'new_pool',
          label: 'Novos bolões',
          description: 'Avisos de bolão novo.',
          enabled: false,
          optOutable: true,
        },
        {
          code: 'prediction_reminder',
          label: 'Lembretes de palpite',
          description: 'Aviso de jogo perto de começar.',
          enabled: false,
          optOutable: true,
        },
        {
          code: 'pool_result',
          label: 'Prêmio disponível',
          description: 'Aviso de prêmio para saque.',
          enabled: true,
          optOutable: false,
        },
      ])
    })

    it('never returns an empty list for a user with no overrides', () => {
      expect(NotificationPreferences.of(CATALOG, {}).list()).toHaveLength(3)
    })
  })

  describe('find()', () => {
    it('returns the catalog entry for a known code', () => {
      expect(NotificationPreferences.of(CATALOG, {}).find('pool_result')).toBe(LOCKED)
    })

    it('returns null for an unknown code', () => {
      expect(NotificationPreferences.of(CATALOG, {}).find('nope')).toBeNull()
    })
  })
})
