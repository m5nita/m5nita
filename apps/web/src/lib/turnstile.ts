import { useCallback, useEffect, useRef, useState } from 'react'

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'flexible' | 'compact'
}

interface TurnstileApi {
  render: (element: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loaderPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (loaderPromise) return loaderPromise
  loaderPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('turnstile requires a browser'))
      return
    }
    if (window.turnstile) {
      resolve(window.turnstile)
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`)
    const script =
      existing ??
      Object.assign(document.createElement('script'), { src: SCRIPT_SRC, async: true, defer: true })
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile)
      else reject(new Error('turnstile failed to initialize'))
    })
    script.addEventListener('error', () => reject(new Error('turnstile script failed to load')))
    if (!existing) document.head.appendChild(script)
  })
  return loaderPromise
}

export interface UseTurnstileResult {
  containerRef: React.RefObject<HTMLDivElement | null>
  token: string | null
  error: string | null
  reset: () => void
}

export interface UseTurnstileOptions {
  theme?: 'light' | 'dark' | 'auto'
}

export function useTurnstile(
  siteKey: string | undefined,
  options: UseTurnstileOptions = {},
): UseTurnstileResult {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const apiRef = useRef<TurnstileApi | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const theme = options.theme ?? 'auto'

  useEffect(() => {
    let cancelled = false
    if (!siteKey) {
      setError('turnstile_not_configured')
      return
    }
    loadTurnstile()
      .then((api) => {
        if (cancelled || !containerRef.current) return
        apiRef.current = api
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: siteKey,
          size: 'flexible',
          theme,
          callback: (tok) => {
            setToken(tok)
            setError(null)
          },
          'error-callback': () => setError('turnstile_error'),
          'expired-callback': () => setToken(null),
        })
      })
      .catch(() => {
        if (!cancelled) setError('turnstile_unavailable')
      })
    return () => {
      cancelled = true
      if (apiRef.current && widgetIdRef.current) {
        apiRef.current.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [siteKey, theme])

  const reset = useCallback(() => {
    setToken(null)
    if (apiRef.current && widgetIdRef.current) {
      apiRef.current.reset(widgetIdRef.current)
    }
  }, [])

  return { containerRef, token, error, reset }
}
