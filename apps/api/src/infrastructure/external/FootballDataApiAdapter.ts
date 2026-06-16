import type { ExternalMatch, FootballDataApi } from '../../application/ports/FootballDataApi.port'

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4'
const RATE_LIMIT_DELAY_MS = 2000

export class FootballDataApiAdapter implements FootballDataApi {
  private lastCallTime = 0

  constructor(private readonly apiToken: string) {}

  async fetchMatches(competitionExternalId: string, season: string): Promise<ExternalMatch[]> {
    return this.request(`/competitions/${competitionExternalId}/matches?season=${season}`)
  }

  async fetchLiveMatches(
    competitionExternalId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<ExternalMatch[]> {
    return this.request(
      `/competitions/${competitionExternalId}/matches?status=IN_PLAY,PAUSED,FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`,
    )
  }

  private async request(endpoint: string): Promise<ExternalMatch[]> {
    await this.rateLimit()

    const res = await fetch(`${FOOTBALL_DATA_BASE}${endpoint}`, {
      // X-Api-Version v4.1 unlocks the live `minute`/`injuryTime` fields on the
      // Livescore plan; the default v4 omits them to keep stable responses.
      headers: { 'X-Auth-Token': this.apiToken, 'X-Api-Version': 'v4.1' },
    })

    if (!res.ok) {
      console.error(`[FootballDataApi] API error: ${res.status} for ${endpoint}`)
      return []
    }

    const data: { matches: ExternalMatch[] } = await res.json()
    return data.matches || []
  }

  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastCallTime
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed))
    }
    this.lastCallTime = Date.now()
  }
}
