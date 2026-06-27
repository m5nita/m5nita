import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Confetti } from './Confetti'

afterEach(() => vi.restoreAllMocks())

describe('Confetti', () => {
  it('renders the requested number of pieces', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const { container } = render(<Confetti count={12} />)
    expect(container.querySelectorAll('.confetti-piece')).toHaveLength(12)
  })

  it('renders nothing under prefers-reduced-motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const { container } = render(<Confetti count={12} />)
    expect(container.querySelector('.confetti-piece')).toBeNull()
  })
})
