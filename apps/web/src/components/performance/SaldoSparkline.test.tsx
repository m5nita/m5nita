import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SaldoSparkline } from './SaldoSparkline'

afterEach(cleanup)

describe('<SaldoSparkline />', () => {
  it('renders nothing with fewer than two points', () => {
    const { container } = render(<SaldoSparkline points={[{ saldoCentavos: 100 }]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws a green line when the final saldo is positive', () => {
    const { container } = render(
      <SaldoSparkline points={[{ saldoCentavos: -100 }, { saldoCentavos: 500 }]} />,
    )
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('.stroke-green')).toBeTruthy()
    expect(container.querySelector('.stroke-red')).toBeNull()
  })

  it('draws a red line when the final saldo is negative', () => {
    const { container } = render(
      <SaldoSparkline points={[{ saldoCentavos: 100 }, { saldoCentavos: -500 }]} />,
    )
    expect(container.querySelector('.stroke-red')).toBeTruthy()
    expect(container.querySelector('.stroke-green')).toBeNull()
  })
})
