import { syncLiveScores } from '../services/match'

export async function runLiveSync() {
  console.log('[Cron] Starting live score sync...')
  await syncLiveScores()
  console.log('[Cron] Live score sync complete')
}
