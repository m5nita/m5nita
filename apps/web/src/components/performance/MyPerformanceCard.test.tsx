import type { MyPerformanceResponse } from '@m5nita/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMyPerformance } from '../../lib/performance'
import { MyPerformanceCard } from './MyPerformanceCard'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))
vi.mock('../../lib/performance', () => ({ useMyPerformance: vi.fn() }))

const mockHook = vi.mocked(useMyPerformance)

function perf(overrides: Partial<MyPerformanceResponse> = {}): MyPerformanceResponse {
  return {
    participei: 17,
    vitorias: 6,
    derrotas: 9,
    emAndamento: 2,
    aproveitamento: 0.4,
    gasteiCentavos: 25500,
    premiosConquistadosCentavos: 61200,
    aSacarCentavos: 9000,
    saldoCentavos: 35700,
    maiorPremioCentavos: 22000,
    evolucao: [],
    ...overrides,
  }
}

function setData(data: MyPerformanceResponse | undefined) {
  mockHook.mockReturnValue({ data } as unknown as ReturnType<typeof useMyPerformance>)
}

afterEach(cleanup)

describe('<MyPerformanceCard />', () => {
  it('renders nothing while data is loading', () => {
    setData(undefined)
    const { container } = render(<MyPerformanceCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a user with no pools', () => {
    setData(perf({ participei: 0 }))
    const { container } = render(<MyPerformanceCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the section header collapsed by default (content hidden)', () => {
    setData(perf())
    render(<MyPerformanceCard />)
    expect(screen.getByRole('heading', { name: /meu desempenho/i })).toBeInTheDocument()
    expect(screen.queryByText(/ver tudo/i)).not.toBeInTheDocument()
  })

  it('expands to show saldo, record and the link when toggled', () => {
    setData(perf())
    const { container } = render(<MyPerformanceCard />)
    fireEvent.click(screen.getByRole('button'))
    expect(container).toHaveTextContent('357,00')
    expect(container).toHaveTextContent('6')
    expect(container).toHaveTextContent('9')
    expect(screen.getByText(/ver tudo/i)).toBeInTheDocument()
    expect(container.querySelector('a[href="/performance"]')).toBeTruthy()
  })
})
