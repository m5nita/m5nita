import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'm5nita.celebrated'

function readSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persist(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]))
  } catch {
    // storage unavailable (private mode) — celebrations may replay; never throw.
  }
}

/** Returns the subset of `keys` not yet celebrated and marks them. Used for the
 *  coalesced exact-score burst: pass every candidate key, fire once if non-empty. */
export function claimUncelebrated(keys: string[]): string[] {
  if (keys.length === 0) return []
  const set = readSet()
  const fresh = keys.filter((k) => !set.has(k))
  if (fresh.length === 0) return []
  for (const k of fresh) set.add(k)
  persist(set)
  return fresh
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function vibrate(pattern: number | number[] = 30): void {
  if (prefersReducedMotion()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // unsupported — no-op.
  }
}

/** Fires `true` exactly once (across reloads) on first mount with a fresh key. */
export function useCelebrateOnce(key: string | null): boolean {
  const [fire, setFire] = useState(false)
  const doneRef = useRef(false)
  useEffect(() => {
    if (doneRef.current || !key) return
    if (claimUncelebrated([key]).length === 0) return
    doneRef.current = true
    setFire(true)
  }, [key])
  return fire
}
