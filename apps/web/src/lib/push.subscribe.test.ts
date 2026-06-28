import { afterEach, describe, expect, it, vi } from 'vitest'

// A valid base64url VAPID public key (so isPushSupported() passes).
const VAPID =
  'BHbTpwHKI_WYgF60Xb0Ox9sI2O5jKBg6S0kBEz7vlJxdC40QvG7_z-1JKboKaky5_g3uBx_ZWfsgyrPn7cveQGw'

describe('subscribe() error handling', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    Reflect.deleteProperty(navigator, 'serviceWorker')
    Reflect.deleteProperty(window, 'PushManager')
    Reflect.deleteProperty(window, 'Notification')
  })

  it('returns "error" instead of throwing when the push service blocks subscribe (e.g. Brave)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID)

    const subscribeMock = vi.fn(async () => {
      throw new DOMException('Registration failed - push service error', 'AbortError')
    })
    const reg = { pushManager: { subscribe: subscribeMock } }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn(async () => reg), ready: Promise.resolve(reg) },
    })
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: function PushManager() {},
    })
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: vi.fn(async () => 'granted') },
    })

    const { subscribe } = await import('./push')

    await expect(subscribe()).resolves.toBe('error')
    expect(subscribeMock).toHaveBeenCalledOnce()
  })
})
