import { describe, expect, it, vi } from 'vitest'

const redirect = vi.fn((opts: { to: string; params?: Record<string, string> }) => {
  const err = new Error(`redirect:${opts.to}`) as Error & {
    isRedirect: true
    to: string
    params?: Record<string, string>
  }
  err.isRedirect = true
  err.to = opts.to
  err.params = opts.params
  return err
})

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (config: { beforeLoad: unknown }) => config,
  redirect: (opts: { to: string; params?: Record<string, string> }) => redirect(opts),
}))

const { Route } = (await import('./index')) as unknown as {
  Route: {
    beforeLoad: (ctx: { params: { poolId: string } }) => void
  }
}

describe('/pools/$poolId/ index redirect', () => {
  it('redirectsToPredictionsTab_whenPoolDetailRoot', () => {
    expect(() => Route.beforeLoad({ params: { poolId: 'pool-123' } })).toThrow(
      'redirect:/pools/$poolId/predictions',
    )
    expect(redirect).toHaveBeenCalledWith({
      to: '/pools/$poolId/predictions',
      params: { poolId: 'pool-123' },
    })
  })
})
