import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApiFetch = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('../../lib/auth', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } } }),
}))

import { PoolHub } from './PoolHub'

const POOL_ID = 'pool-1'

function poolPayload(over: Record<string, unknown> = {}) {
  return {
    id: POOL_ID,
    name: 'Bolão da firma',
    entryFee: 5000,
    ownerId: 'user-1',
    inviteCode: 'ABC123',
    competitionId: 'comp-1',
    matchdayFrom: null,
    matchdayTo: null,
    matchId: null,
    status: 'active',
    isOpen: true,
    couponId: null,
    competitionName: 'Brasileirão',
    owner: { id: 'user-1', name: 'Igor' },
    memberCount: 4,
    prizeTotal: 19000,
    hasLiveMatch: false,
    isMember: true,
    statsAvailable: true,
    userStats: null,
    ...over,
  }
}

function renderHub(
  payload: Record<string, unknown>,
  activeTab: 'predictions' | 'ranking' | 'statistics' = 'predictions',
) {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => payload })

  const rootRoute = createRootRoute({
    component: () => (
      <PoolHub poolId={POOL_ID} activeTab={activeTab}>
        {() => <div data-testid="child" />}
      </PoolHub>
    ),
  })
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/pools/$poolId/predictions',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/pools/$poolId/stats',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/pools/$poolId/ranking',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/pools/$poolId/manage',
      component: () => null,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/invite/$inviteCode',
      component: () => null,
    }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({
      initialEntries: [`/pools/${POOL_ID}/${activeTab === 'statistics' ? 'stats' : activeTab}`],
    }),
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('<PoolHub /> — statistics tab availability', () => {
  it('shows the tab when the API says statistics are available', async () => {
    renderHub(poolPayload({ statsAvailable: true }))

    expect(await screen.findByRole('tab', { name: /estatísticas/i })).toBeInTheDocument()
  })

  it('hides the tab when the API says they are not', async () => {
    renderHub(poolPayload({ statsAvailable: false, matchdayFrom: 5, matchdayTo: 8 }))

    expect(await screen.findByRole('tab', { name: /palpites/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /estatísticas/i })).not.toBeInTheDocument()
  })

  it('shows the tab on a matchday-range pool for a viewer who already unlocked it', async () => {
    renderHub(poolPayload({ statsAvailable: true, matchdayFrom: 5, matchdayTo: 8 }))

    expect(await screen.findByRole('tab', { name: /estatísticas/i })).toBeInTheDocument()
  })

  it('redirects to predictions when landing on the stats tab without availability', async () => {
    const router = renderHub(poolPayload({ statsAvailable: false }), 'statistics')

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/pools/${POOL_ID}/predictions`)
    })
  })

  it('stays on the stats tab when statistics are available', async () => {
    const router = renderHub(poolPayload({ statsAvailable: true }), 'statistics')

    expect(await screen.findByTestId('child')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/pools/${POOL_ID}/stats`)
  })
})
