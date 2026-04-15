import { describe, expect, it } from 'vitest'
import {
  InvalidCaptchaTokenError,
  MissingCaptchaTokenError,
  TurnstileToken,
} from '../TurnstileToken'

describe('TurnstileToken', () => {
  it('fromHeader_missing_throwsMissing', () => {
    expect(() => TurnstileToken.fromHeader(undefined)).toThrow(MissingCaptchaTokenError)
    expect(() => TurnstileToken.fromHeader('')).toThrow(MissingCaptchaTokenError)
    expect(() => TurnstileToken.fromHeader('   ')).toThrow(MissingCaptchaTokenError)
  })

  it('fromHeader_tooLong_throwsInvalid', () => {
    const tooLong = 'x'.repeat(2049)
    expect(() => TurnstileToken.fromHeader(tooLong)).toThrow(InvalidCaptchaTokenError)
  })

  it('fromHeader_valid_returnsToken', () => {
    const token = TurnstileToken.fromHeader('abc.def.ghi')
    expect(token.value).toBe('abc.def.ghi')
  })
})
