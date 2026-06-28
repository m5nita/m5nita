import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { MatchPredictionsList } from './MatchPredictionsList'

afterEach(cleanup)

const base = {
  matchId: 'm1',
  matchStatus: 'finished' as const,
  isLocked: true as true,
  totalMembers: 2,
  viewerIncluded: true,
  viewerDidPredict: true,
  nonPredictors: [] as never[],
}

it('renders the advance-pick chip with the picked team name on a knockout match', () => {
  render(
    <MatchPredictionsList
      data={{
        ...base,
        predictors: [
          {
            userId: 'u2',
            name: 'Alberto',
            homeScore: 1,
            awayScore: 1,
            points: 7,
            advanceBonus: 2,
            advancePick: 'home',
          },
        ],
      }}
      stage="final"
      homeTeam="Brasil"
      awayTeam="Argentina"
      homeFlag={null}
      awayFlag={null}
    />,
  )
  expect(screen.getByText('Brasil')).toBeInTheDocument()
  expect(screen.getByText('+5')).toBeInTheDocument()
  expect(screen.getByText('+2')).toBeInTheDocument()
})

it('renders no chip on a group-stage match', () => {
  render(
    <MatchPredictionsList
      data={{
        ...base,
        predictors: [
          {
            userId: 'u2',
            name: 'Alberto',
            homeScore: 2,
            awayScore: 1,
            points: 5,
            advancePick: 'home',
          },
        ],
      }}
      stage="group"
      homeTeam="Brasil"
      awayTeam="Argentina"
      homeFlag={null}
      awayFlag={null}
    />,
  )
  expect(screen.queryByText('Brasil')).not.toBeInTheDocument()
})
