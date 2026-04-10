// This file MUST be imported (as a side-effect import) before anything else in src/index.ts.
// Sentry's Node SDK patches native modules and HTTP libraries at require time,
// so initialising after another library imports http/https breaks auto-instrumentation.

import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: true,

    integrations: [nodeProfilingIntegration()],

    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    profileSessionSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? 1.0),
    profileLifecycle: 'trace',

    enableLogs: true,
  })
}
