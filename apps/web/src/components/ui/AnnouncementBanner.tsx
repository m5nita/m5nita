import { useRouter } from '@tanstack/react-router'
import { type MouseEvent, useState } from 'react'
import { parseAnnouncementConfig } from '../../lib/announcement'

const DISMISS_KEY = 'm5nita.banner.dismissed'

/** Session-scoped dismissal, keyed by campaign id. Fails open on storage errors. */
function isDismissed(id: string): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === id
  } catch {
    return false
  }
}

function dismissBanner(id: string): void {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, id)
  } catch {
    // storage unavailable (e.g. private mode) — dismissal simply won't persist
  }
}

/**
 * Global announcement banner. Reads its content from build-time Vite env
 * (`VITE_BANNER_*`) and renders at the top of every page via the root layout.
 * Renders nothing when unconfigured/disabled or dismissed for the session.
 */
export function AnnouncementBanner() {
  const router = useRouter()
  const banner = parseAnnouncementConfig(import.meta.env)
  const [hidden, setHidden] = useState(() => (banner ? isDismissed(banner.id) : true))

  if (!banner || hidden) return null

  const onInternalClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    router.history.push(banner.href)
  }

  const onDismiss = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    dismissBanner(banner.id)
    setHidden(true)
  }

  const linkProps = banner.isExternal
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : { onClick: onInternalClick }

  return (
    <section aria-label="Aviso" className="w-full bg-red text-white">
      <div className="mx-auto flex max-w-[430px] items-center gap-2 px-5 py-2.5 lg:max-w-7xl">
        <a
          href={banner.href}
          {...linkProps}
          className="group flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 text-center text-sm font-semibold leading-snug hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <span className="min-w-0">{banner.message}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 transition-transform group-hover:translate-x-0.5"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </a>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="-mr-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </section>
  )
}
