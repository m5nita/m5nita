import { describe, expect, it, vi } from 'vitest'
import { clearChunkReloadGuard, installChunkReloadHandler } from './chunkReload'

function fakeWindow() {
  const store = new Map<string, string>()
  const listeners = new Map<string, EventListener[]>()
  const reload = vi.fn()
  const win = {
    addEventListener: (type: string, cb: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), cb])
    },
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    },
    location: { reload },
  }
  const dispatch = (type: string) => {
    for (const cb of listeners.get(type) ?? []) cb(new Event(type))
  }
  return { win: win as unknown as Window, reload, dispatch }
}

describe('chunkReload', () => {
  it('reloads once on the first vite:preloadError (stale chunk after deploy)', () => {
    const { win, reload, dispatch } = fakeWindow()
    installChunkReloadHandler(win)
    dispatch('vite:preloadError')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload again while the guard is set (no reload loop)', () => {
    const { win, reload, dispatch } = fakeWindow()
    installChunkReloadHandler(win)
    dispatch('vite:preloadError')
    dispatch('vite:preloadError')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again after the guard is cleared on a successful boot', () => {
    const { win, reload, dispatch } = fakeWindow()
    installChunkReloadHandler(win)
    dispatch('vite:preloadError')
    clearChunkReloadGuard(win)
    dispatch('vite:preloadError')
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
