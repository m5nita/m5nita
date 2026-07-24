import { createFileRoute } from '@tanstack/react-router'
import { PerformanceScreen } from '../components/performance/PerformanceScreen'
import { requireAuthGuard } from '../lib/authGuard'

export const Route = createFileRoute('/performance')({
  beforeLoad: () => requireAuthGuard(),
  component: PerformanceScreen,
})
