import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LandingPage } from './LandingPage'

beforeEach(() => {
  class FakeObserver {
    observe = vi.fn()
    disconnect = vi.fn()
    constructor(public callback: IntersectionObserverCallback) {}
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function renderWithRouter() {
  const rootRoute = createRootRoute({ component: () => <LandingPage /> })
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
  const howRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/how-it-works',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute, howRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('<LandingPage />', () => {
  it('renders the hero H1 "Monte seu bolão."', async () => {
    renderWithRouter()
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.textContent).toContain('Monte seu')
    expect(h1.textContent).toContain('bolão')
  })

  it('renders the floating "Entrar" link → /login', async () => {
    renderWithRouter()
    const links = await screen.findAllByRole('link', { name: /entrar/i })
    expect(links.some((a) => a.getAttribute('href') === '/login')).toBe(true)
  })

  it('renders the primary "Começar agora" CTA → /login', async () => {
    renderWithRouter()
    const links = await screen.findAllByRole('link', { name: /começar agora/i })
    expect(links.some((a) => a.getAttribute('href') === '/login')).toBe(true)
  })

  it('renders the final "Criar minha conta" CTA → /login', async () => {
    renderWithRouter()
    const links = await screen.findAllByRole('link', { name: /criar minha conta/i })
    expect(links.some((a) => a.getAttribute('href') === '/login')).toBe(true)
  })

  it('links to /how-it-works from ScoringMini', async () => {
    renderWithRouter()
    const links = await screen.findAllByRole('link', { name: /ver regras completas/i })
    expect(links.some((a) => a.getAttribute('href') === '/how-it-works')).toBe(true)
  })
})
