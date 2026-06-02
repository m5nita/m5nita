import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PoolsSection } from './PoolsSection'

afterEach(cleanup)

describe('<PoolsSection />', () => {
  it('shows skeletons while loading (not the empty state)', () => {
    render(<PoolsSection isPending isError={false} isEmpty onRetry={() => {}} />)
    expect(screen.getByTestId('pools-loading')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum bolão')).not.toBeInTheDocument()
  })

  it('shows an error with retry when the fetch failed — never the empty state', () => {
    const onRetry = vi.fn()
    render(<PoolsSection isPending={false} isError isEmpty onRetry={onRetry} />)

    expect(screen.queryByText('Nenhum bolão')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Tentar novamente'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the empty state only when the fetch succeeded with no pools', () => {
    render(<PoolsSection isPending={false} isError={false} isEmpty onRetry={() => {}} />)
    expect(screen.getByText('Nenhum bolão')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the pool cards when there is data', () => {
    render(
      <PoolsSection isPending={false} isError={false} isEmpty={false} onRetry={() => {}}>
        <div data-testid="pool-cards">cards</div>
      </PoolsSection>,
    )
    expect(screen.getByTestId('pool-cards')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum bolão')).not.toBeInTheDocument()
  })
})
