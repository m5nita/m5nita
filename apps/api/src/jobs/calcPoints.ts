import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { prediction } from '../db/schema/prediction'
import { match } from '../db/schema/match'
import { calculatePoints } from '../services/scoring'

export async function calcPointsForMatch(matchId: string) {
  const matchData = await db.query.match.findFirst({
    where: eq(match.id, matchId),
  })

  if (!matchData || matchData.status !== 'finished') {
    console.log(`[CalcPoints] Match ${matchId} not finished, skipping`)
    return
  }

  if (matchData.homeScore == null || matchData.awayScore == null) {
    console.log(`[CalcPoints] Match ${matchId} missing scores, skipping`)
    return
  }

  const predictions = await db.query.prediction.findMany({
    where: eq(prediction.matchId, matchId),
  })

  for (const pred of predictions) {
    const points = calculatePoints(
      pred.homeScore,
      pred.awayScore,
      matchData.homeScore,
      matchData.awayScore,
    )

    await db
      .update(prediction)
      .set({ points, updatedAt: new Date() })
      .where(eq(prediction.id, pred.id))
  }

  console.log(`[CalcPoints] Processed ${predictions.length} predictions for match ${matchId}`)
}
