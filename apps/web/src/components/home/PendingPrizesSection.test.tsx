import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApiFetch = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

import { formatCurrency } from '../../lib/utils'
import { PendingPrizesSection } from './PendingPrizesSection'

// formatCurrency usa NBSP ( ) entre "R$" e o valor. getByText normaliza o
// whitespace do texto do DOM (colapsando   em espaço comum), mas NÃO
// normaliza a string do matcher — então comparar direto contra
// formatCurrency(...) nunca bate. Normalizamos aqui o lado do matcher do
// mesmo jeito, sem introduzir um literal de moeda no teste (mesma
// abordagem de WithdrawalStatusCard.test.tsx e PrizeWithdrawal.test.tsx).
const money = (cents: number) => formatCurrency(cents).replace(/ /g, ' ')

afterEach(() => {
  cleanup()
  mockApiFetch.mockReset()
})

function renderSection(items: unknown[]) {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ items }) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PendingPrizesSection />
    </QueryClientProvider>,
  )
}

describe('PendingPrizesSection', () => {
  it('renders nothing when there are no prizes', async () => {
    renderSection([])

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    expect(screen.queryByText('Seus prêmios')).toBeNull()
  })

  it('offers the withdrawal action when nothing was requested yet', async () => {
    renderSection([
      {
        poolId: 'p1',
        poolName: 'Bolão Um',
        winnerShare: 24000,
        winnerCount: 1,
        withdrawal: null,
      },
    ])

    expect(await screen.findByText('Solicitar retirada')).toBeTruthy()
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
  })

  it('shows the requested state instead of the form once a withdrawal exists', async () => {
    renderSection([
      {
        poolId: 'p1',
        poolName: 'Bolão Um',
        winnerShare: 24000,
        winnerCount: 1,
        withdrawal: {
          amount: 24000,
          pixKey: '*******8909',
          status: 'pending',
          requestedAt: '2026-07-30T14:32:00.000Z',
        },
      },
    ])

    expect(await screen.findByText('Retirada solicitada')).toBeTruthy()
    expect(screen.getByText(money(24000))).toBeTruthy()
    expect(screen.queryByText('Solicitar retirada')).toBeNull()
  })
})
