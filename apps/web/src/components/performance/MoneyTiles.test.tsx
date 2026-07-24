import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoneyTiles } from './MoneyTiles'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

describe('<MoneyTiles />', () => {
  it('shows gastei and prêmios', () => {
    const { container } = render(
      <MoneyTiles
        gasteiCentavos={25500}
        premiosConquistadosCentavos={61200}
        aSacarCentavos={0}
        maiorPremioCentavos={null}
      />,
    )
    expect(container).toHaveTextContent('255,00')
    expect(container).toHaveTextContent('612,00')
  })

  it('shows the "a sacar" CTA linking to the withdrawal surface only when there is something to withdraw', () => {
    const { container, rerender } = render(
      <MoneyTiles
        gasteiCentavos={0}
        premiosConquistadosCentavos={0}
        aSacarCentavos={0}
        maiorPremioCentavos={null}
      />,
    )
    expect(screen.queryByText(/a sacar/i)).not.toBeInTheDocument()

    rerender(
      <MoneyTiles
        gasteiCentavos={0}
        premiosConquistadosCentavos={9000}
        aSacarCentavos={9000}
        maiorPremioCentavos={null}
      />,
    )
    expect(screen.getByText(/a sacar/i)).toBeInTheDocument()
    expect(container.querySelector('a[href="/"]')).toBeTruthy()
  })

  it('shows maior prêmio only when the user has won something', () => {
    const { rerender } = render(
      <MoneyTiles
        gasteiCentavos={0}
        premiosConquistadosCentavos={0}
        aSacarCentavos={0}
        maiorPremioCentavos={null}
      />,
    )
    expect(screen.queryByText(/maior prêmio/i)).not.toBeInTheDocument()

    rerender(
      <MoneyTiles
        gasteiCentavos={0}
        premiosConquistadosCentavos={22000}
        aSacarCentavos={0}
        maiorPremioCentavos={22000}
      />,
    )
    expect(screen.getByText(/maior prêmio/i)).toBeInTheDocument()
  })
})
