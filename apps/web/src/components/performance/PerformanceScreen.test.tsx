import type { MyPerformanceResponse } from '@m5nita/shared'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMyPerformance } from '../../lib/performance'
import { PerformanceScreen } from './PerformanceScreen'

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
    evolucao: [
      { poolId: 'a', settledAt: null, saldoCentavos: -1500 },
      { poolId: 'b', settledAt: null, saldoCentavos: 35700 },
    ],
    ...overrides,
  }
}

function setState(state: Partial<ReturnType<typeof useMyPerformance>>) {
  mockHook.mockReturnValue({
    data: undefined,
    isPending: false,
    error: null,
    refetch: vi.fn(),
    ...state,
  } as unknown as ReturnType<typeof useMyPerformance>)
}

afterEach(cleanup)

describe('<PerformanceScreen />', () => {
  it('shows an error with retry when the fetch failed', () => {
    setState({ error: new Error('boom') } as never)
    render(<PerformanceScreen />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows the empty state when the user has no pools', () => {
    setState({ data: perf({ participei: 0 }) } as never)
    render(<PerformanceScreen />)
    expect(screen.getByText(/sua carreira começa aqui/i)).toBeInTheDocument()
  })

  it('renders the saldo hero and money block when there is data', () => {
    setState({ data: perf() } as never)
    const { container } = render(<PerformanceScreen />)
    expect(container).toHaveTextContent('357,00')
    expect(container).toHaveTextContent('40%')
    expect(screen.getByText(/a sacar/i)).toBeInTheDocument()
  })
})
