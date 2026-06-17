/**
 * Pure parser for the global announcement banner config (build-time Vite env).
 * Returns a validated descriptor when the banner should show, or `null`.
 * No React, no storage, no globals — trivially unit-testable.
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

/** Small deterministic hash (djb2 → base36) for deriving a campaign id. */
function hashId(input: string): string {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

export function parseAnnouncementConfig(env: AnnouncementEnv): AnnouncementBanner | null {
  if (env.VITE_BANNER_ENABLED?.trim().toLowerCase() !== 'true') return null
  const message = env.VITE_BANNER_MESSAGE?.trim() ?? ''
  if (message === '') return null
  const href = env.VITE_BANNER_LINK?.trim() ?? ''
  if (href === '' || !isValidHref(href)) return null
  const explicitId = env.VITE_BANNER_ID?.trim()
  const id = explicitId && explicitId !== '' ? explicitId : hashId(`${message} ${href}`)
  return { id, message, href, isExternal: EXTERNAL_URL.test(href) }
}
