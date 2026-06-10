import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../lib/theme'

const mockUseSession = vi.fn()

vi.mock('../lib/auth', () => ({
  useSession: () => mockUseSession(),
  authClient: { signOut: vi.fn(async () => undefined) },
}))

import { Route as rootFileRoute } from './__root'

function renderLayoutAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: rootFileRoute.options.component })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return render(
    <ThemeProvider>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('<RootLayout /> header', () => {
  it('shows an "Entrar" link → /login inside the header for logged-out visitors', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
    renderLayoutAt('/')

    const banner = await screen.findByRole('banner')
    const link = await screen.findByRole('link', { name: /entrar/i })
    expect(link.getAttribute('href')).toBe('/login')
    expect(banner.contains(link)).toBe(true)
  })

  it('hides the "Entrar" link on the /login page itself', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
    renderLayoutAt('/login')

    await screen.findByRole('banner')
    expect(screen.queryByRole('link', { name: /entrar/i })).toBeNull()
  })

  it('does not show "Entrar" for authenticated users (nav is shown instead)', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1', name: 'Jogadora' } },
      isPending: false,
    })
    renderLayoutAt('/')

    await screen.findByRole('navigation', { name: /navegação principal/i })
    expect(screen.queryByRole('link', { name: /entrar/i })).toBeNull()
  })
})
