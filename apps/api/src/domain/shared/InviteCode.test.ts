import { describe, expect, it } from 'vitest'
import { InviteCode } from './InviteCode'

describe('InviteCode', () => {
  const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  describe('generate()', () => {
    it('produces an 8-character code from the valid charset', () => {
      const code = InviteCode.generate()
      expect(code.value).toHaveLength(8)
      for (const char of code.value) {
        expect(VALID_CHARS).toContain(char)
      }
    })

    it('produces different codes on successive calls', () => {
      const a = InviteCode.generate()
      const b = InviteCode.generate()
      expect(a.value).not.toBe(b.value)
    })
  })

  describe('from()', () => {
    it('wraps an existing string value', () => {
      const code = InviteCode.from('ABCD2345')
      expect(code.value).toBe('ABCD2345')
    })
  })
})
