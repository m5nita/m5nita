import './landing.css'
import { DemoCreatePool } from './DemoCreatePool'
import { DemoLiveRanking } from './DemoLiveRanking'
import { DemoPredict } from './DemoPredict'
import { FinalCta } from './FinalCta'
import { FloatingLoginLink } from './FloatingLoginLink'
import { Hero } from './Hero'
import { InviteFriendsBand } from './InviteFriendsBand'
import { ScoringMini } from './ScoringMini'

export function LandingPage() {
  return (
    <div className="relative">
      <FloatingLoginLink />
      <Hero />
      <DemoCreatePool />
      <DemoPredict />
      <DemoLiveRanking />
      <ScoringMini />
      <InviteFriendsBand />
      <FinalCta />
    </div>
  )
}
