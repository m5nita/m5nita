import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

const state = {
  fixtures: [] as unknown[],
  liveScores: [] as unknown[],
  calls: [] as StubCallLog[],
}

function record(summary: string) {
  state.calls.push({
    provider: 'football-data',
    timestamp: new Date().toISOString(),
    direction: 'outbound',
    summary,
  })
}

export const footballDataStub = {
  handlers: [
    http.get('https://api.football-data.org/v4/*', ({ request }) => {
      record(`GET ${new URL(request.url).pathname}`)
      return HttpResponse.json({ matches: state.fixtures })
    }),
  ],
  setFixtures(fixtures: unknown[]) {
    state.fixtures = fixtures
  },
  setLiveScores(scores: unknown[]) {
    state.liveScores = scores
  },
  reset() {
    state.fixtures = []
    state.liveScores = []
    state.calls = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
