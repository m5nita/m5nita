import { THEME_STORAGE_KEY, type ThemePreference } from './types'

let memoryPref: ThemePreference | null = null

function isValidPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function safeGetItem(): string | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : null
  } catch {
    return null
  }
}

function safeSetItem(value: string): boolean {
  try {
    if (typeof window === 'undefined') return false
    window.localStorage.setItem(THEME_STORAGE_KEY, value)
    return true
  } catch {
    return false
  }
}

function safeRemoveItem(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    // noop
  }
}

export const themeStorage = {
  read(): ThemePreference {
    const raw = safeGetItem()
    if (raw === null) {
      return memoryPref ?? 'system'
    }
    if (isValidPreference(raw)) {
      return raw
    }
    safeRemoveItem()
    return 'system'
  },
  write(pref: ThemePreference): void {
    memoryPref = pref
    safeSetItem(pref)
  },
}
