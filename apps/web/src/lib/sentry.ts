// This file MUST be imported (as a side-effect import) before anything else in src/main.tsx.
// Sentry must be initialised before React / TanStack Router instantiate so that navigation
// instrumentation and the error boundary can hook into the app lifecycle.

import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_COMMIT_HASH,
    sendDefaultPii: false,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.browserProfilingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],

    tracesSampleRate: 0.1,
    tracePropagationTargets: [/^\//, /^https:\/\/(?:.*\.)?m5nita\.com\//],

    profilesSampleRate: 1.0,

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    enableLogs: true,
  })
}
