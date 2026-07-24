import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AproveitamentoDonut } from './AproveitamentoDonut'

afterEach(cleanup)

describe('<AproveitamentoDonut />', () => {
  it('renders the percentage and the V·D record with data', () => {
    const { container } = render(
      <AproveitamentoDonut aproveitamento={0.4} vitorias={6} derrotas={9} />,
    )
    expect(container).toHaveTextContent('40%')
    expect(container).toHaveTextContent('6V')
    expect(container).toHaveTextContent('9D')
    // track + value arc
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('shows "—" and "sem dados ainda" when no pool is decided', () => {
    const { container } = render(
      <AproveitamentoDonut aproveitamento={null} vitorias={0} derrotas={0} />,
    )
    expect(container).toHaveTextContent('—')
    expect(screen.getByText(/sem dados ainda/i)).toBeInTheDocument()
    // only the track circle — no value arc
    expect(container.querySelectorAll('circle').length).toBe(1)
  })
})
