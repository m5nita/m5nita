import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatCurrency } from '../../lib/utils'

const mockApiFetch = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

import { PrizeWithdrawal } from './PrizeWithdrawal'

// formatCurrency usa NBSP ( ) entre "R$" e o valor. getByText normaliza o
// whitespace do texto do DOM, mas NÃO normaliza a string do matcher — então
// comparar direto contra formatCurrency(...) nunca bate. Normalizamos aqui o
// lado do matcher do mesmo jeito, sem introduzir um literal de moeda no teste
// (mesma abordagem de WithdrawalStatusCard.test.tsx).
const money = (cents: number) => formatCurrency(cents).replace(/ /g, ' ')

function prizePayload(over: Record<string, unknown> = {}) {
  return {
    prizeTotal: 24000,
    winnerCount: 1,
    winnerShare: 24000,
    isWinner: true,
    withdrawal: null,
    winners: [],
    ...over,
  }
}

function renderPrizeWithdrawal(payload: Record<string, unknown>, poolId: string) {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => payload })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <PrizeWithdrawal poolId={poolId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  // useCelebrateOnce persists to localStorage — start each test from a clean slate.
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('<PrizeWithdrawal /> — withdrawal status wired into the pool hub', () => {
  it('shows the "acompanhe a retirada" copy and the pix key exactly as the API sent it (pending)', async () => {
    renderPrizeWithdrawal(
      prizePayload({
        withdrawal: {
          id: 'w-1',
          poolId: 'pool-pending',
          userId: 'user-1',
          amount: 24000,
          pixKeyType: 'phone',
          pixKey: '***********8909',
          status: 'pending',
          createdAt: '2026-07-30T14:32:00.000Z',
          paidAt: null,
        },
      }),
      'pool-pending',
    )

    expect(
      await screen.findByText('Parabéns! O prêmio é seu — acompanhe a retirada abaixo.'),
    ).toBeTruthy()
    expect(screen.getByText('Retirada solicitada')).toBeTruthy()
    // The key must appear verbatim, exactly as the API masked it — never re-masked.
    expect(screen.getByText(/\*{11}8909/)).toBeTruthy()
    // Regression guard for the double-masking bug this task fixed: the local
    // maskPixKey() bullet form must never show up anywhere on the page.
    expect(screen.queryByText(/•/)).toBeNull()
  })

  it('shows the "Prêmio pago" copy and the paid card (completed)', async () => {
    renderPrizeWithdrawal(
      prizePayload({
        withdrawal: {
          id: 'w-2',
          poolId: 'pool-completed',
          userId: 'user-1',
          amount: 24000,
          pixKeyType: 'phone',
          pixKey: '***********8909',
          status: 'completed',
          createdAt: '2026-07-30T14:32:00.000Z',
          paidAt: '2026-07-31T09:10:00.000Z',
        },
      }),
      'pool-completed',
    )

    expect(
      await screen.findByText('Prêmio pago — o valor já saiu para a sua chave PIX.'),
    ).toBeTruthy()
    expect(screen.getByText('Prêmio pago')).toBeTruthy()
    expect(screen.getAllByText(money(24000)).length).toBeGreaterThan(0)
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
  })
})
