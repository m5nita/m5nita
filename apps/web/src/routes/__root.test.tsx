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
  vi.stubEnv('VITE_BANNER_ENABLED', '')
  // Neutralize the ambient .env(.local) scheduling window so the banner-mount
  // test doesn't depend on today's date being inside VITE_BANNER_START/END.
  vi.stubEnv('VITE_BANNER_START', '')
  vi.stubEnv('VITE_BANNER_END', '')
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
  vi.unstubAllEnvs()
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

describe('<RootLayout /> announcement banner', () => {
  it('mounts the announcement banner region app-wide when configured', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
    vi.stubEnv('VITE_BANNER_ENABLED', 'true')
    vi.stubEnv('VITE_BANNER_MESSAGE', 'Aviso de teste')
    vi.stubEnv('VITE_BANNER_LINK', '/login')
    renderLayoutAt('/')

    expect(await screen.findByRole('region', { name: /aviso/i })).toBeInTheDocument()
  })

  it('renders no banner when disabled', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
    renderLayoutAt('/')

    await screen.findByRole('banner')
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })
})
