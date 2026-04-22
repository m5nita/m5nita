import { describe, expect, it, vi } from 'vitest'

const redirect = vi.fn(
  (opts: { to: string; params?: Record<string, string>; replace?: boolean }) => {
    const err = new Error(`redirect:${opts.to}`) as Error & {
      isRedirect: true
      to: string
      params?: Record<string, string>
      replace?: boolean
    }
    err.isRedirect = true
    err.to = opts.to
    err.params = opts.params
    err.replace = opts.replace
    return err
  },
)

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: (_path: string) => (config: { beforeLoad: unknown }) => config,
  redirect: (opts: { to: string; params?: Record<string, string>; replace?: boolean }) =>
    redirect(opts),
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
      replace: true,
    })
  })
})
