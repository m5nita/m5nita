import { SCORING } from '@m5nita/shared'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScoringMini } from './ScoringMini'

function renderWithRouter(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <>{ui}</> })
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
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(<RouterProvider router={router} />)
}

describe('<ScoringMini />', () => {
  it('renders all four scoring tiers using SCORING constants', async () => {
    renderWithRouter(<ScoringMini />)
    expect(await screen.findByText(String(SCORING.EXACT_MATCH))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.WINNER_AND_DIFF))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.OUTCOME_CORRECT))).toBeInTheDocument()
    expect(screen.getByText(String(SCORING.MISS))).toBeInTheDocument()
  })

  it('links to /how-it-works for full rules', () => {
    renderWithRouter(<ScoringMini />)
    const link = screen.getByRole('link', { name: /ver regras completas/i })
    expect(link.getAttribute('href')).toBe('/how-it-works')
  })
})
