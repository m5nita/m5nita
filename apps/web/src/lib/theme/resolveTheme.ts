import type { EffectiveTheme, ThemePreference } from './types'

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): EffectiveTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemPrefersDark ? 'dark' : 'light'
}
