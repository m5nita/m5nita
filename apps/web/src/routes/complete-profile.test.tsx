import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockUpdateUser = vi.fn()

vi.mock('../lib/auth', () => ({
  authClient: {
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  },
}))

import { Route as completeProfileRoute } from './complete-profile'

function renderPage() {
  const rootRoute = createRootRoute()
  const profileRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/complete-profile',
    component: completeProfileRoute.options.component,
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, profileRoute]),
    history: createMemoryHistory({ initialEntries: ['/complete-profile'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
})

describe('<CompleteProfilePage />', () => {
  it('saves the trimmed name through authClient.updateUser (session-cache safe) and goes home', async () => {
    mockUpdateUser.mockResolvedValue({ data: { status: true }, error: null })
    const router = renderPage()

    fireEvent.change(await screen.findByLabelText('Nome'), {
      target: { value: '  Maria Silva  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ name: 'Maria Silva' })
    })
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
  })

  it('shows the error and stays on the page when updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'Nome inválido' } })
    const router = renderPage()

    fireEvent.change(await screen.findByLabelText('Nome'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Nome inválido')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/complete-profile')
  })

  it('does not call updateUser when the name is empty', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Informe seu nome')).toBeTruthy()
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })
})
