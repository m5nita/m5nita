import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Loading } from './Loading'

describe('<Loading />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('renders nothing during the brief delay so the global bar covers quick loads', () => {
    render(<Loading message="Carregando..." />)
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument()
  })

  it('shows the bouncing-ball loader + message once the delay passes', () => {
    const { container } = render(<Loading message="Carregando..." />)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.getByText('Carregando...')).toBeInTheDocument()
    expect(container.querySelector('.ball-loader')).not.toBeNull()
  })
})
