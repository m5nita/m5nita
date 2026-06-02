import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScoreInput } from './ScoreInput'

function makeDeferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderInput(
  onSave: (matchId: string, h: number, a: number) => Promise<unknown>,
  { strict = false }: { strict?: boolean } = {},
) {
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const node = (
    <ScoreInput
      matchId="m1"
      homeTeam="BRA"
      awayTeam="ARG"
      homeFlag={null}
      awayFlag={null}
      matchDate={matchDate}
      homeScore={null}
      awayScore={null}
      matchStatus="scheduled"
      points={null}
      actualHomeScore={null}
      actualAwayScore={null}
      onSave={onSave}
    />
  )
  return render(strict ? <StrictMode>{node}</StrictMode> : node)
}

function typeScore() {
  fireEvent.change(screen.getByLabelText('Gols BRA'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('Gols ARG'), { target: { value: '1' } })
  act(() => {
    vi.advanceTimersByTime(500) // debounce
  })
}

describe('<ScoreInput /> save status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('shows "Salvando..." while the save is in flight', async () => {
    const onSave = vi.fn(() => makeDeferred<void>().promise)
    renderInput(onSave)
    typeScore()

    expect(onSave).toHaveBeenCalledWith('m1', 2, 1)
    expect(screen.getByText('Salvando...')).toBeInTheDocument()
  })

  it('does NOT show "Salvo" until the save actually resolves', async () => {
    const deferred = makeDeferred<void>()
    const onSave = vi.fn(() => deferred.promise)
    renderInput(onSave)
    typeScore()

    // Let any spurious timers fire — status must still not be "Salvo".
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument()

    await act(async () => {
      deferred.resolve()
      await Promise.resolve()
    })
    expect(screen.getByText('Salvo')).toBeInTheDocument()
  })

  it('shows "Não salvo" when the save is rejected (e.g. 403 after kickoff)', async () => {
    const deferred = makeDeferred<void>()
    const onSave = vi.fn(() => deferred.promise)
    renderInput(onSave)
    typeScore()

    await act(async () => {
      deferred.reject(new Error('MATCH_STARTED'))
      await Promise.resolve()
    })

    expect(screen.getByText('Não salvo')).toBeInTheDocument()
    expect(screen.queryByText('Salvo')).not.toBeInTheDocument()
  })

  it('still reports "Salvo" under StrictMode (mount effects double-invoke)', async () => {
    const deferred = makeDeferred<void>()
    const onSave = vi.fn(() => deferred.promise)
    renderInput(onSave, { strict: true })
    typeScore()

    await act(async () => {
      deferred.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Salvo')).toBeInTheDocument()
    expect(screen.queryByText('Salvando...')).not.toBeInTheDocument()
  })
})
