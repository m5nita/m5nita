import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { resolveTheme } from './resolveTheme'
import { themeStorage } from './storage'
import type { EffectiveTheme, ThemePreference } from './types'

interface ThemeContextValue {
  preference: ThemePreference
  effective: EffectiveTheme
  setPreference: (next: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

const DARK_BG = '#1a1613'
const LIGHT_BG = '#f5f0e8'
const DYNAMIC_META_ID = 'theme-color-dynamic'

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyThemeSideEffects(effective: EffectiveTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-theme', effective)
  root.style.colorScheme = effective

  let meta = document.getElementById(DYNAMIC_META_ID) as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.id = DYNAMIC_META_ID
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = effective === 'dark' ? DARK_BG : LIGHT_BG
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => themeStorage.read())
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => getSystemPrefersDark())

  const effective = useMemo<EffectiveTheme>(
    () => resolveTheme(preference, systemPrefersDark),
    [preference, systemPrefersDark],
  )

  useEffect(() => {
    applyThemeSideEffects(effective)
  }, [effective])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    themeStorage.write(next)
    setPreferenceState(next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, effective, setPreference }),
    [preference, effective, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
