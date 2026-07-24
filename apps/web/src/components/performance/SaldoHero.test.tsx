import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SaldoHero } from './SaldoHero'

afterEach(cleanup)

describe('<SaldoHero />', () => {
  it('shows a positive saldo in green with a + sign', () => {
    const { container } = render(<SaldoHero saldoCentavos={35700} participei={17} />)
    const saldo = container.querySelector('.text-green')
    expect(saldo?.textContent).toContain('+')
    expect(saldo?.textContent).toContain('357,00')
    expect(container.querySelector('.text-red')).toBeNull()
    expect(container).toHaveTextContent('17 bolões')
  })

  it('shows a negative saldo in red with a minus sign', () => {
    const { container } = render(<SaldoHero saldoCentavos={-8500} participei={3} />)
    const saldo = container.querySelector('.text-red')
    expect(saldo?.textContent).toContain('−')
    expect(saldo?.textContent).toContain('85,00')
    expect(container.querySelector('.text-green')).toBeNull()
  })

  it('reads "nenhum bolão ainda" for a fresh user', () => {
    const { container } = render(<SaldoHero saldoCentavos={0} participei={0} />)
    expect(container).toHaveTextContent('nenhum bolão ainda')
  })
})
