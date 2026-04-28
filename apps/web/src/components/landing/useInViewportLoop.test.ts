import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInViewportLoop } from './useInViewportLoop'

describe('useInViewportLoop', () => {
  let observerInstances: Array<{
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    callback: IntersectionObserverCallback
  }> = []

  beforeEach(() => {
    observerInstances = []
    class FakeObserver {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(public callback: IntersectionObserverCallback) {
        observerInstances.push({
          observe: this.observe,
          disconnect: this.disconnect,
          callback,
        })
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns isRunning=false initially', () => {
    const { result } = renderHook(() => useInViewportLoop<HTMLDivElement>())
    expect(result.current.isRunning).toBe(false)
  })

  it('observes the ref node when attached at render time', () => {
    const node = document.createElement('div')
    renderHook(() => {
      const value = useInViewportLoop<HTMLDivElement>()
      value.ref.current = node
      return value
    })
    expect(observerInstances).toHaveLength(1)
    expect(observerInstances[0]?.observe).toHaveBeenCalledWith(node)
  })

  it('toggles isRunning when entry intersects/leaves viewport', () => {
    const node = document.createElement('div')
    const { result, rerender } = renderHook(() => {
      const value = useInViewportLoop<HTMLDivElement>()
      value.ref.current = node
      return value
    })
    rerender()

    const observer = observerInstances[0]!
    expect(observer).toBeDefined()

    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isRunning).toBe(true)

    act(() => {
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isRunning).toBe(false)
  })

  it('disconnects observer on unmount', () => {
    const node = document.createElement('div')
    const { unmount, rerender } = renderHook(() => {
      const value = useInViewportLoop<HTMLDivElement>()
      value.ref.current = node
      return value
    })
    rerender()
    const observer = observerInstances[0]!
    unmount()
    expect(observer.disconnect).toHaveBeenCalled()
  })
})
