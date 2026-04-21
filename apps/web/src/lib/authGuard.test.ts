import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const signOut = vi.fn()
const redirect = vi.fn((opts: { to: string }) => {
  const err = new Error(`redirect:${opts.to}`) as Error & { isRedirect: true; to: string }
  err.isRedirect = true
  err.to = opts.to
  return err
})

vi.mock('@tanstack/react-router', () => ({
  redirect: (opts: { to: string }) => redirect(opts),
}))

vi.mock('./auth', () => ({
  authClient: {
    getSession: () => getSession(),
    signOut: () => signOut(),
  },
}))

const { requireAuthGuard } = await import('./authGuard')

describe('requireAuthGuard', () => {
  beforeEach(() => {
    getSession.mockReset()
    signOut.mockReset().mockResolvedValue(undefined)
    redirect.mockClear()
  })

  it('redirectsToLogin_whenSessionDataNull', async () => {
    getSession.mockResolvedValue({ data: null })
    await expect(requireAuthGuard()).rejects.toThrow('redirect:/login')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('redirectsToLoginAndSignsOut_whenSessionHasNoUser', async () => {
    getSession.mockResolvedValue({ data: { session: { id: 's1' }, user: undefined } })
    await expect(requireAuthGuard()).rejects.toThrow('redirect:/login')
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('redirectsToCompleteProfile_whenUserHasNoName', async () => {
    getSession.mockResolvedValue({ data: { session: { id: 's1' }, user: { id: 'u1', name: '' } } })
    await expect(requireAuthGuard()).rejects.toThrow('redirect:/complete-profile')
    expect(signOut).not.toHaveBeenCalled()
  })

  it('returnsSessionData_whenUserHasName', async () => {
    const data = { session: { id: 's1' }, user: { id: 'u1', name: 'Igor' } }
    getSession.mockResolvedValue({ data })
    await expect(requireAuthGuard()).resolves.toBe(data)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('swallowsSignOutFailure_andStillRedirects', async () => {
    getSession.mockResolvedValue({ data: { session: { id: 's1' } } })
    signOut.mockRejectedValue(new Error('network'))
    await expect(requireAuthGuard()).rejects.toThrow('redirect:/login')
  })
})
