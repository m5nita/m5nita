// This file MUST be imported (as a side-effect import) before anything else in src/main.tsx.
// Sentry must be initialised before React / TanStack Router instantiate so that navigation
// instrumentation and the error boundary can hook into the app lifecycle.

import { addIntegration, init } from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_COMMIT_HASH,
    sendDefaultPii: false,

    integrations: [],

    tracesSampleRate: 0.1,
    tracePropagationTargets: [/^\//, /^https:\/\/(?:.*\.)?m5nita\.com\//],

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    enableLogs: true,
  })

  const loadExtras = async () => {
    const { browserTracingIntegration, replayIntegration } = await import('@sentry/react')
    addIntegration(browserTracingIntegration())
    addIntegration(
      replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    )
  }

  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        void loadExtras()
      })
    } else {
      setTimeout(() => {
        void loadExtras()
      }, 2000)
    }
  }
}
