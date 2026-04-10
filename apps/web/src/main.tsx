// Sentry must initialise before the router / providers mount. Side-effect import.
import './lib/sentry'

import { registerSW } from 'virtual:pwa-register'
import * as Sentry from '@sentry/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import './styles/app.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 1000)
    }
  },
  onOfflineReady() {},
})

const rootElement = document.getElementById('root')

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <Sentry.ErrorBoundary
        fallback={({ resetError }) => (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream p-5 text-center">
            <h1 className="font-display text-3xl font-black text-black">Algo deu errado</h1>
            <p className="text-sm text-gray-muted">
              Registramos o erro. Tente recarregar a página.
            </p>
            <button
              type="button"
              onClick={resetError}
              className="bg-black px-6 py-3 font-display text-xs font-bold uppercase tracking-wider text-white"
            >
              Tentar novamente
            </button>
          </div>
        )}
      >
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </Sentry.ErrorBoundary>
    </StrictMode>,
  )
}
