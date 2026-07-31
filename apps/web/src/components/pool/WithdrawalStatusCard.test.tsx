import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { formatCurrency } from '../../lib/utils'
import { WithdrawalStatusCard } from './WithdrawalStatusCard'

afterEach(cleanup)

const BASE = {
  amount: 24000,
  pixKey: '*******8909',
  requestedAt: '2026-07-30T14:32:00.000Z',
}

// formatCurrency usa NBSP ( ) entre "R$" e o valor. getByText normaliza o
// whitespace do texto do DOM (colapsando   em espaço comum), mas NÃO
// normaliza a string do matcher — então comparar direto contra
// formatCurrency(...) nunca bate. Normalizamos aqui o lado do matcher do
// mesmo jeito, sem introduzir um literal de moeda no teste.
const money = (cents: number) => formatCurrency(cents).replace(/ /g, ' ')

describe('WithdrawalStatusCard', () => {
  it('renders the requested state without promising a deadline', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" />)

    expect(screen.getByText('Retirada solicitada')).toBeTruthy()
    // formatCurrency usa NBSP — comparar contra a função, nunca contra literal.
    expect(screen.getByText(money(24000))).toBeTruthy()
    expect(screen.getByText(/avisamos assim que o PIX for enviado/i)).toBeTruthy()
    expect(screen.queryByText(/dias úteis/i)).toBeNull()
  })

  it('renders the paid state with the amount in focus', () => {
    render(
      <WithdrawalStatusCard
        {...BASE}
        status="completed"
        paidAt="2026-07-31T09:10:00.000Z"
        celebrateKey={null}
      />,
    )

    expect(screen.getByText('Prêmio pago')).toBeTruthy()
    expect(screen.getByText(money(24000))).toBeTruthy()
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
  })

  it('shows the pix key exactly as the API sent it — never re-masked', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" />)

    expect(screen.getByText(/\*{7}8909/)).toBeTruthy()
  })

  it('renders the pool name when given', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" poolName="Bolão da firma" />)

    expect(screen.getByText('Bolão da firma')).toBeTruthy()
  })

  // headline="win" is the pool hub, where this card is the only one on screen and
  // has to carry both the celebration and the withdrawal state.
  it('celebrates the win and demotes the paid state to the detail line', () => {
    render(
      <WithdrawalStatusCard
        {...BASE}
        status="completed"
        paidAt="2026-07-31T09:10:00.000Z"
        celebrateKey={null}
        headline="win"
      />,
    )

    expect(screen.getByText('Você ganhou')).toBeTruthy()
    expect(screen.getByText(/Prêmio pago · enviado para/)).toBeTruthy()
    // The state must not be dropped on the way — it is what distinguishes the
    // two phases once the title stops announcing it.
    expect(screen.queryByText('Prêmio pago')).toBeNull()
  })

  it('celebrates the win and demotes the requested state to the detail line', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" headline="win" />)

    expect(screen.getByText('Você ganhou')).toBeTruthy()
    expect(screen.getByText(/Retirada solicitada · PIX/)).toBeTruthy()
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
    // Still says what happens next — celebrating must not swallow the promise.
    expect(screen.getByText(/avisamos assim que o PIX for enviado/i)).toBeTruthy()
  })
})
