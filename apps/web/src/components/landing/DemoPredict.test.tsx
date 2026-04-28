import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoPredict } from './DemoPredict'

describe('<DemoPredict />', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders all four match rows', () => {
    const { container } = render(<DemoPredict />)
    const rows = container.querySelectorAll('.d2-row')
    expect(rows.length).toBe(4)
  })

  it('renders flag images with empty alt text (decorative)', () => {
    const { container } = render(<DemoPredict />)
    const flags = container.querySelectorAll('img.d2-flag')
    expect(flags.length).toBe(8) // 4 matches × 2 flags
    flags.forEach((img) => {
      expect(img.getAttribute('alt')).toBe('')
    })
  })

  it('renders the predictors panel for the live match (M2)', () => {
    const { container } = render(<DemoPredict />)
    const m2 = container.querySelector('.d2-row.m2')
    expect(m2).not.toBeNull()
    const panel = m2?.querySelector('.d2-predictors')
    expect(panel).not.toBeNull()
    // Three predictors
    const predRows = panel?.querySelectorAll('.d2-pred-row') ?? []
    expect(predRows.length).toBe(3)
  })

  it('shows the toggle button for both M1 (finished) and M2 (live)', () => {
    const { container } = render(<DemoPredict />)
    const m1Toggle = container.querySelector('.d2-row.m1 .d2-toggle')
    const m2Toggle = container.querySelector('.d2-row.m2 .d2-toggle')
    expect(m1Toggle).not.toBeNull()
    expect(m2Toggle).not.toBeNull()
  })

  it('does NOT show toggle button for pending matches (M3, M4)', () => {
    const { container } = render(<DemoPredict />)
    expect(container.querySelector('.d2-row.m3 .d2-toggle')).toBeNull()
    expect(container.querySelector('.d2-row.m4 .d2-toggle')).toBeNull()
  })
})
