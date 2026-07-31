import { describe, expect, it } from 'vitest'
import { NOTIFICATION_TYPE_CODES, NotificationType } from './NotificationType'

function build(overrides: Partial<Parameters<typeof NotificationType.of>[0]> = {}) {
  return NotificationType.of({
    code: 'new_pool',
    label: 'Novos bolões',
    description: 'Avisos de bolão novo.',
    optOutable: true,
    defaultEnabled: true,
    sortOrder: 1,
    ...overrides,
  })
}

describe('NotificationType', () => {
  describe('of()', () => {
    it('rejects a blank code', () => {
      expect(() => build({ code: '  ' })).toThrow(/code/i)
    })

    it('rejects a blank label', () => {
      expect(() => build({ label: '' })).toThrow(/label/i)
    })

    it('keeps the catalog attributes it was given', () => {
      const type = build({ sortOrder: 3 })
      expect(type.code).toBe('new_pool')
      expect(type.label).toBe('Novos bolões')
      expect(type.description).toBe('Avisos de bolão novo.')
      expect(type.sortOrder).toBe(3)
    })

    it('accepts a code the compile-time union does not know (newly seeded type)', () => {
      expect(build({ code: 'pool_closing' }).code).toBe('pool_closing')
    })
  })

  describe('resolveEnabled()', () => {
    it('falls back to the catalog default when the user never chose', () => {
      expect(build({ defaultEnabled: true }).resolveEnabled(undefined)).toBe(true)
      expect(build({ defaultEnabled: false }).resolveEnabled(undefined)).toBe(false)
    })

    it('honours the user override on an opt-outable type', () => {
      expect(build({ defaultEnabled: true }).resolveEnabled(false)).toBe(false)
      expect(build({ defaultEnabled: false }).resolveEnabled(true)).toBe(true)
    })

    it('always delivers a non-opt-outable type, even with a stored false', () => {
      const locked = build({ code: 'pool_result', optOutable: false })
      expect(locked.resolveEnabled(false)).toBe(true)
      expect(locked.resolveEnabled(undefined)).toBe(true)
    })

    it('always delivers a non-opt-outable type even when the catalog default is off', () => {
      const locked = build({ optOutable: false, defaultEnabled: false })
      expect(locked.resolveEnabled(false)).toBe(true)
    })
  })

  describe('canBeDisabled()', () => {
    it('is true for an opt-outable type', () => {
      expect(build({ optOutable: true }).canBeDisabled()).toBe(true)
    })

    it('is false for a locked type', () => {
      expect(build({ optOutable: false }).canBeDisabled()).toBe(false)
    })
  })

  describe('NOTIFICATION_TYPE_CODES', () => {
    it('lists the codes the application sends, with no duplicates', () => {
      expect([...NOTIFICATION_TYPE_CODES]).toEqual([
        'new_pool',
        'prediction_reminder',
        'match_points',
        'pool_result',
        'withdrawal_paid',
      ])
      expect(new Set(NOTIFICATION_TYPE_CODES).size).toBe(NOTIFICATION_TYPE_CODES.length)
    })
  })
})
