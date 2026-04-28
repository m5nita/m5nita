import { createFileRoute } from '@tanstack/react-router'
import { DashboardHome } from '../components/home/DashboardHome'
import { LandingPage } from '../components/landing/LandingPage'
import { Loading } from '../components/ui/Loading'
import { useSession } from '../lib/auth'

function HomePage() {
  const { data: session, isPending } = useSession()
  if (isPending) return <Loading />
  return session ? <DashboardHome /> : <LandingPage />
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
