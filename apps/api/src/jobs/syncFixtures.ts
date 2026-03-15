import { syncFixtures } from '../services/match'

// Run on import when used as a cron entry point
// In production, use node-cron or external scheduler
export async function runFixtureSync() {
  console.log('[Cron] Starting fixture sync...')
  await syncFixtures()
  console.log('[Cron] Fixture sync complete')
}
