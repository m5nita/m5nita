import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnnouncementBanner } from './AnnouncementBanner'

function setBannerEnv(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    VITE_BANNER_ENABLED: 'true',
    VITE_BANNER_MESSAGE: 'A Copa está acabando, mas o m5nita continua!',
    VITE_BANNER_LINK: '/how-it-works',
    VITE_BANNER_ID: 'test-campaign',
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

function renderBanner(initialPath = '/') {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <div data-testid="layout-ready" />
        <AnnouncementBanner />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const howRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/how-it-works',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, howRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

/** Wait until the router has actually rendered the layout — so "no banner" assertions are meaningful. */
async function waitForLayout() {
  await screen.findByTestId('layout-ready')
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  sessionStorage.clear()
})

describe('<AnnouncementBanner /> — display & navigation', () => {
  it('renders the configured message inside an "Aviso" region', async () => {
    setBannerEnv()
    renderBanner()
    expect(await screen.findByText(/a copa está acabando/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /aviso/i })).toBeInTheDocument()
  })

  it('renders an external link that opens in a new tab safely', async () => {
    setBannerEnv({ VITE_BANNER_LINK: 'https://m5nita.com/proximos' })
    renderBanner()
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('href', 'https://m5nita.com/proximos')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('navigates in-app for an internal link (no new tab)', async () => {
    setBannerEnv({ VITE_BANNER_LINK: '/how-it-works' })
    const router = renderBanner('/')
    const link = await screen.findByRole('link')
    expect(link).not.toHaveAttribute('target', '_blank')
    fireEvent.click(link)
    await waitFor(() => expect(router.state.location.pathname).toBe('/how-it-works'))
  })
})

describe('<AnnouncementBanner /> — off / degraded states', () => {
  it('renders nothing when disabled', async () => {
    setBannerEnv({ VITE_BANNER_ENABLED: 'false' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('renders nothing when the message is blank', async () => {
    setBannerEnv({ VITE_BANNER_MESSAGE: '   ' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('renders nothing when the link is missing', async () => {
    setBannerEnv({ VITE_BANNER_LINK: '' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('renders nothing when the link is invalid', async () => {
    setBannerEnv({ VITE_BANNER_LINK: 'not-a-valid-link' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })
})

describe('<AnnouncementBanner /> — dismissal', () => {
  it('dismisses for the session without navigating', async () => {
    setBannerEnv({ VITE_BANNER_LINK: '/how-it-works', VITE_BANNER_ID: 'test-campaign' })
    const router = renderBanner('/')
    const dismiss = await screen.findByRole('button', { name: /fechar aviso/i })
    fireEvent.click(dismiss)
    await waitFor(() => expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull())
    expect(sessionStorage.getItem('m5nita.banner.dismissed')).toBe('test-campaign')
    expect(router.state.location.pathname).toBe('/')
  })

  it('stays hidden on mount when already dismissed this session (same id)', async () => {
    sessionStorage.setItem('m5nita.banner.dismissed', 'test-campaign')
    setBannerEnv({ VITE_BANNER_ID: 'test-campaign' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('shows again when a different campaign id was dismissed', async () => {
    sessionStorage.setItem('m5nita.banner.dismissed', 'old-campaign')
    setBannerEnv({ VITE_BANNER_ID: 'new-campaign' })
    renderBanner()
    expect(await screen.findByRole('region', { name: /aviso/i })).toBeInTheDocument()
  })
})

describe('<AnnouncementBanner /> — scheduling', () => {
  it('does not render before the configured start date', async () => {
    setBannerEnv({ VITE_BANNER_START: '2099-01-01T00:00:00Z' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('does not render after the configured end date', async () => {
    setBannerEnv({ VITE_BANNER_END: '2000-01-01T00:00:00Z' })
    renderBanner()
    await waitForLayout()
    expect(screen.queryByRole('region', { name: /aviso/i })).toBeNull()
  })

  it('renders within the configured start–end window', async () => {
    setBannerEnv({
      VITE_BANNER_START: '2000-01-01T00:00:00Z',
      VITE_BANNER_END: '2099-01-01T00:00:00Z',
    })
    renderBanner()
    expect(await screen.findByRole('region', { name: /aviso/i })).toBeInTheDocument()
  })
})
