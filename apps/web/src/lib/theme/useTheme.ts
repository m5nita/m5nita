import { useContext } from 'react'
import { ThemeContext } from './ThemeProvider'
import type { EffectiveTheme, ThemePreference } from './types'

export interface UseThemeResult {
  preference: ThemePreference
  effective: EffectiveTheme
  setPreference: (next: ThemePreference) => void
}

export function useTheme(): UseThemeResult {
  const ctx = useContext(ThemeContext)
  if (ctx === null) {
    if (import.meta.env.DEV) {
      throw new Error('useTheme must be used inside <ThemeProvider>')
    }
    return { preference: 'system', effective: 'light', setPreference: () => {} }
  }
  return ctx
}
