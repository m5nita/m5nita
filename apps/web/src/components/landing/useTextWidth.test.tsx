import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTextWidth } from './useTextWidth'

describe('useTextWidth', () => {
  let originalGetBoundingClientRect: typeof Element.prototype.getBoundingClientRect

  beforeEach(() => {
    originalGetBoundingClientRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function () {
      return {
        width: 137.4,
        height: 16,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve() },
    })
  })

  afterEach(() => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
    vi.restoreAllMocks()
  })

  it('sets the --typed-width CSS variable on the ref node after fonts ready', async () => {
    function Wrapper() {
      const ref = useTextWidth('Bolão da firma')
      return <span ref={ref}>Bolão da firma</span>
    }
    const { container } = render(<Wrapper />)
    const span = container.querySelector('span') as HTMLSpanElement
    // Wait for the next microtask so document.fonts.ready resolves
    await Promise.resolve()
    await Promise.resolve()
    // getBoundingClientRect mock returned 137.4 → Math.ceil → 138
    expect(span.style.getPropertyValue('--typed-width')).toBe('138px')
  })
})
