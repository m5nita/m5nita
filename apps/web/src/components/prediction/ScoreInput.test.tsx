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
  onSave: (
    matchId: string,
    h: number,
    a: number,
    advancePick: 'home' | 'away' | null,
  ) => Promise<unknown>,
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
      stage="group"
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

    expect(onSave).toHaveBeenCalledWith('m1', 2, 1, null)
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

function renderKnockout(
  onSave: (matchId: string, h: number, a: number, advancePick: 'home' | 'away' | null) => unknown,
  overrides: Record<string, unknown> = {},
) {
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return render(
    <ScoreInput
      matchId="m1"
      homeTeam="BRA"
      awayTeam="ARG"
      homeFlag={null}
      awayFlag={null}
      matchDate={matchDate}
      stage="round_of_16"
      homeScore={null}
      awayScore={null}
      matchStatus="scheduled"
      points={null}
      actualHomeScore={null}
      actualAwayScore={null}
      onSave={onSave}
      {...overrides}
    />,
  )
}

describe('<ScoreInput /> knockout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('offers the advance picker on a scheduled knockout match', () => {
    renderKnockout(vi.fn(async () => {}))
    expect(screen.getByText(/Quem se classifica/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'BRA' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ARG' })).toBeInTheDocument()
  })

  it('persists the advance pick alongside the scoreline', async () => {
    const onSave = vi.fn(async () => {})
    renderKnockout(onSave)

    fireEvent.change(screen.getByLabelText('Gols BRA'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Gols ARG'), { target: { value: '2' } })
    act(() => {
      vi.advanceTimersByTime(500)
    })

    fireEvent.click(screen.getByRole('button', { name: 'BRA' }))
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onSave).toHaveBeenCalledWith('m1', 2, 2, 'home')
  })

  it('shows the shootout tally inline in parens in the result header on penalties', () => {
    renderKnockout(
      vi.fn(async () => {}),
      {
        matchStatus: 'finished',
        actualHomeScore: 1,
        actualAwayScore: 1,
        duration: 'penalty_shootout',
        penaltyHomeScore: 4,
        penaltyAwayScore: 2,
        advancePick: 'home',
      },
    )

    // Header reads "Resultado oficial 1 (4) x (2) 1": each team's shootout tally
    // sits in parens beside its score; the separate "(Pên.)" tag is gone.
    expect(screen.queryByText('(Pên.)')).not.toBeInTheDocument()
    expect(screen.getByText('(4)')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    const header = screen.getByText('Resultado oficial').closest('div')
    expect(header?.textContent?.replace(/\s/g, '')).toContain('1(4)x(2)1')
  })

  it('adds the extra-time goals to the result header (aggregate) on extra time', () => {
    renderKnockout(
      vi.fn(async () => {}),
      {
        matchStatus: 'finished',
        actualHomeScore: 1,
        actualAwayScore: 1,
        duration: 'extra_time',
        extraTimeHomeScore: 0,
        extraTimeAwayScore: 1,
        advancePick: 'away',
      },
    )

    // 90' was 1-1; extra time adds the away goal → aggregate 1 x 2 in the header.
    const header = screen.getByText('Resultado oficial').closest('div')
    expect(header?.textContent).toContain('2')
  })

  it('does not offer the advance picker for a group-stage match', () => {
    renderKnockout(
      vi.fn(async () => {}),
      { stage: 'group' },
    )
    expect(screen.queryByText(/Quem se classifica/)).not.toBeInTheDocument()
  })
})

function renderLive(overrides: Record<string, unknown> = {}) {
  const matchDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  return render(
    <ScoreInput
      matchId="m1"
      homeTeam="BRA"
      awayTeam="ARG"
      homeFlag={null}
      awayFlag={null}
      matchDate={matchDate}
      stage="group"
      homeScore={null}
      awayScore={null}
      matchStatus="live"
      points={null}
      actualHomeScore={0}
      actualAwayScore={0}
      onSave={vi.fn(async () => {})}
      {...overrides}
    />,
  )
}

describe('<ScoreInput /> live minute', () => {
  afterEach(() => cleanup())

  it('shows the running minute next to "Ao Vivo" when live', () => {
    renderLive({ minute: 67 })
    expect(screen.getByText('Ao Vivo')).toBeInTheDocument()
    expect(screen.getByText(/67'/)).toBeInTheDocument()
  })

  it('shows stoppage time as MM+N', () => {
    renderLive({ minute: 45, injuryTime: 2 })
    expect(screen.getByText(/45\+2'/)).toBeInTheDocument()
  })

  it('shows no minute when the feed omits it', () => {
    renderLive({ minute: null })
    expect(screen.getByText('Ao Vivo')).toBeInTheDocument()
    expect(screen.queryByText(/\d+'/)).not.toBeInTheDocument()
  })
})

function renderFinishedKnockout({
  points,
  advanceBonus,
}: {
  points: number
  advanceBonus: number
}) {
  return render(
    <ScoreInput
      matchId="m1"
      homeTeam="BRA"
      awayTeam="ARG"
      homeFlag={null}
      awayFlag={null}
      matchDate={new Date(Date.now() - 86_400_000).toISOString()}
      stage="final"
      homeScore={0}
      awayScore={0}
      advancePick="home"
      matchStatus="finished"
      points={points}
      category={points - advanceBonus}
      bonus={0}
      advanceBonus={advanceBonus}
      actualHomeScore={1}
      actualAwayScore={1}
      duration="penalty_shootout"
      onSave={vi.fn(async () => {})}
    />,
  )
}

describe('<ScoreInput /> advance bonus decomposition', () => {
  afterEach(cleanup)

  it('decomposes points as "+5 +2 pts" when there is an advance bonus', () => {
    renderFinishedKnockout({ points: 7, advanceBonus: 2 })
    expect(screen.getByText('+5')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('pts')).toBeInTheDocument()
  })
})

it('drops confetti when you click the +10 on a finished exact score', () => {
  render(
    <ScoreInput
      matchId="m1"
      homeTeam="Brasil"
      awayTeam="França"
      homeFlag={null}
      awayFlag={null}
      matchDate="2026-06-10T18:00:00Z"
      stage="group"
      homeScore={2}
      awayScore={1}
      matchStatus="finished"
      points={10}
      category={10}
      bonus={0}
      actualHomeScore={2}
      actualAwayScore={1}
      onSave={() => {}}
    />,
  )
  expect(document.querySelectorAll('.confetti-piece').length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: /comemorar o placar exato/i }))
  expect(document.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0)
})
