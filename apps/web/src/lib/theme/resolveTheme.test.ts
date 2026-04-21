import { describe, expect, it } from 'vitest'
import { resolveTheme } from './resolveTheme'

describe('resolveTheme', () => {
  it('resolveTheme_preferenceLightSystemLight_returnsLight', () => {
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('resolveTheme_preferenceLightSystemDark_returnsLight', () => {
    expect(resolveTheme('light', true)).toBe('light')
  })

  it('resolveTheme_preferenceDarkSystemLight_returnsDark', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('resolveTheme_preferenceDarkSystemDark_returnsDark', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('resolveTheme_preferenceSystemSystemDark_returnsDark', () => {
    expect(resolveTheme('system', true)).toBe('dark')
  })

  it('resolveTheme_preferenceSystemSystemLight_returnsLight', () => {
    expect(resolveTheme('system', false)).toBe('light')
  })
})
