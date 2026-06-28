import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import type { PoolForMatch, PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PredictionRepository } from '../../domain/prediction/PredictionRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import type { MatchPointsData, NotificationService } from '../ports/NotificationService.port'

/**
 * On match finish, fan out a per-pool "pontos conquistados" notification: for
 * each pool that includes the match and each member who predicted it, emit the
 * points earned and the resulting position. Reads already-computed
 * `prediction.points` + ranking (written by calcPointsForMatch just before),
 * so it adds no scoring. Cost is O(pools): one prediction query + one ranking
 * query per pool, never per member.
 */
export class NotifyMatchPointsUseCase {
  constructor(
    private readonly matchRepo: MatchRepository,
    private readonly poolRepo: PoolRepository,
    private readonly predictionRepo: PredictionRepository,
    private readonly rankingRepo: RankingRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(matchId: string): Promise<void> {
    const match = await this.matchRepo.findById(matchId)
    if (match?.status !== 'finished') return

    const items = await this.collectItems(match)
    if (items.length > 0) await this.notificationService.notifyMatchPoints(items)
  }

  private async collectItems(match: MatchData): Promise<MatchPointsData[]> {
    const pools = await this.poolRepo.findActivePoolsForMatch({
      id: match.id,
      competitionId: match.competitionId,
      matchday: match.matchday,
    })
    const items: MatchPointsData[] = []
    for (const pool of pools) {
      items.push(...(await this.buildPoolItems(pool, match)))
    }
    return items
  }

  private async buildPoolItems(pool: PoolForMatch, match: MatchData): Promise<MatchPointsData[]> {
    const predictions = await this.predictionRepo.findByPoolMatch(pool.id, match.id)
    if (predictions.length === 0) return []

    const positionByUser = await this.positionMap(pool.id)
    return predictions.map((prediction) => ({
      userId: prediction.userId,
      poolId: pool.id,
      poolName: pool.name,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      points: prediction.points ?? 0,
      position: positionByUser.get(prediction.userId) ?? 0,
    }))
  }

  private async positionMap(poolId: string): Promise<Map<string, number>> {
    const ranking = await this.rankingRepo.getPoolRanking(poolId, '')
    return new Map(ranking.map((entry) => [entry.userId, entry.position]))
  }
}
