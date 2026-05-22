import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type UpcomingMatch, UpcomingMatchPicker } from './UpcomingMatchPicker'

const mockApiFetch = vi.hoisted(() => vi.fn())

vi.mock('../../lib/api', () => ({
  apiFetch: mockApiFetch,
}))

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function makeMatch(over: Partial<UpcomingMatch> = {}): UpcomingMatch {
  return {
    id: 'm-1',
    matchday: null,
    stage: null,
    kickoffAt: '2026-05-25T18:00:00Z',
    homeTeam: { name: 'A', crest: '' },
    awayTeam: { name: 'B', crest: '' },
    status: 'scheduled',
    ...over,
  }
}

describe('<UpcomingMatchPicker />', () => {
  beforeEach(() => mockApiFetch.mockReset())
  afterEach(() => {
    cleanup()
    mockApiFetch.mockReset()
  })

  it('groups league matches by matchday', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          makeMatch({ id: 'm-1', matchday: 30, homeTeam: { name: 'A', crest: '' } }),
          makeMatch({ id: 'm-2', matchday: 31, homeTeam: { name: 'C', crest: '' } }),
        ],
      }),
    )

    renderWithClient(<UpcomingMatchPicker competitionId="comp-1" value="" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Rodada 30')).toBeTruthy())
    expect(screen.getByText('Rodada 31')).toBeTruthy()
  })

  it('groups cup matches by stage (Portuguese label)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          makeMatch({ id: 'm-1', stage: 'SEMI_FINALS' }),
          makeMatch({ id: 'm-2', stage: 'FINAL', homeTeam: { name: 'X', crest: '' } }),
        ],
      }),
    )

    renderWithClient(<UpcomingMatchPicker competitionId="comp-1" value="" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText('Semifinal')).toBeTruthy())
    expect(screen.getByText('Final')).toBeTruthy()
  })

  it('renders empty state when server returns no matches', async () => {
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ matches: [] }))

    renderWithClient(<UpcomingMatchPicker competitionId="comp-1" value="" onChange={() => {}} />)

    await waitFor(() => expect(screen.getByText(/Nenhum jogo futuro disponível/i)).toBeTruthy())
  })

  it('collapses to a summary row with "Trocar" once a match is chosen', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        matches: [
          makeMatch({
            id: 'm-1',
            matchday: 30,
            homeTeam: { name: 'Flamengo', crest: '' },
            awayTeam: { name: 'Palmeiras', crest: '' },
          }),
        ],
      }),
    )

    function Harness() {
      const [v, setV] = useState('')
      return <UpcomingMatchPicker competitionId="comp-1" value={v} onChange={setV} />
    }

    renderWithClient(<Harness />)

    const radio = await screen.findByDisplayValue('m-1')
    radio.click()

    await waitFor(() => expect(screen.getByText('Trocar')).toBeTruthy())
    expect(screen.getByText('Flamengo × Palmeiras')).toBeTruthy()
    // The list of options is no longer rendered while collapsed.
    expect(screen.queryByDisplayValue('m-1')).toBeNull()

    screen.getByText('Trocar').click()
    await waitFor(() => expect(screen.getByDisplayValue('m-1')).toBeTruthy())
  })

  it('drops items that disappear from the server (refetch-after-kickoff)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ matches: [makeMatch({ id: 'm-1', matchday: 30 })] }),
    )

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <UpcomingMatchPicker competitionId="comp-1" value="" onChange={() => {}} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(view.queryByText('Rodada 30')).toBeTruthy())

    mockApiFetch.mockResolvedValueOnce(jsonResponse({ matches: [] }))
    await client.invalidateQueries({ queryKey: ['upcoming-matches', 'comp-1'] })

    await waitFor(() => expect(view.getByText(/Nenhum jogo futuro disponível/i)).toBeTruthy())
  })
})
