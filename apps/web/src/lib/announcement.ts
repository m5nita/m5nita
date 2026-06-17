/**
 * Pure parser for the global announcement banner config (build-time Vite env).
 * Returns a validated descriptor when the banner should show, or `null`.
 * No React, no storage, no globals — `nowMs` is injected so it stays testable.
 */
export type AnnouncementBanner = {
  /** Stable campaign id — used as the sessionStorage dismissal key. */
  id: string
  /** Short message shown to the user (trimmed, non-empty). */
  message: string
  /** Validated destination: an http(s) URL or an internal path starting with "/". */
  href: string
  /** True when href is an external http(s) URL → open in a new tab. */
  isExternal: boolean
}

export type AnnouncementEnv = {
  VITE_BANNER_ENABLED?: string
  VITE_BANNER_MESSAGE?: string
  VITE_BANNER_LINK?: string
  VITE_BANNER_ID?: string
  /** Optional ISO 8601 datetime — banner is hidden before this instant. */
  VITE_BANNER_START?: string
  /** Optional ISO 8601 datetime — banner is hidden after this instant. */
  VITE_BANNER_END?: string
}

const EXTERNAL_URL = /^https?:\/\//i

function isValidHref(href: string): boolean {
  if (href.startsWith('/')) return true
  if (!EXTERNAL_URL.test(href)) return false
  try {
    new URL(href)
    return true
  } catch {
    return false
  }
}

/** Parse an optional ISO datetime bound: `null` = no bound, `'invalid'` = misconfigured. */
function boundMs(value: string | undefined): number | null | 'invalid' {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  return Number.isNaN(ms) ? 'invalid' : ms
}

/** True when `nowMs` is inside the optional [start, end] window. Invalid bounds fail closed. */
function isWithinWindow(env: AnnouncementEnv, nowMs: number): boolean {
  const start = boundMs(env.VITE_BANNER_START)
  const end = boundMs(env.VITE_BANNER_END)
  if (start === 'invalid' || end === 'invalid') return false
  if (start !== null && nowMs < start) return false
  if (end !== null && nowMs > end) return false
  return true
}

/** Small deterministic hash (djb2 → base36) for deriving a campaign id. */
function hashId(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

export function parseAnnouncementConfig(
  env: AnnouncementEnv,
  nowMs: number = Date.now(),
): AnnouncementBanner | null {
  if (env.VITE_BANNER_ENABLED?.trim().toLowerCase() !== 'true') return null
  const message = env.VITE_BANNER_MESSAGE?.trim() ?? ''
  if (message === '') return null
  const href = env.VITE_BANNER_LINK?.trim() ?? ''
  if (href === '' || !isValidHref(href)) return null
  if (!isWithinWindow(env, nowMs)) return null
  const explicitId = env.VITE_BANNER_ID?.trim()
  const id = explicitId && explicitId !== '' ? explicitId : hashId(`${message} ${href}`)
  return { id, message, href, isExternal: EXTERNAL_URL.test(href) }
}
