import './landing.css'
import { DemoCreatePool } from './DemoCreatePool'
import { DemoLiveRanking } from './DemoLiveRanking'
import { DemoPredict } from './DemoPredict'
import { FinalCta } from './FinalCta'
import { Hero } from './Hero'
import { InviteFriendsBand } from './InviteFriendsBand'
import { ScoringMini } from './ScoringMini'

export function LandingPage() {
  return (
    <div className="relative">
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
