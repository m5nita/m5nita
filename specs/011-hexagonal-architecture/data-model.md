# Data Model: Migração para Arquitetura Hexagonal com SOLID

**Date**: 2026-04-12

## Value Objects (domain/shared/)

### Money
- `centavos: number` (readonly, integer >= 0)
- Factory: `Money.of(centavos: number)`
- Methods: `percentage(rate)`, `subtract(other)`, `splitEqual(parts)`, `equals(other)`
- Validation: Must be non-negative integer

### EntryFee
- `value: Money` (readonly)
- Factory: `EntryFee.of(centavos: number)`
- Validation: MIN_ENTRY_FEE (100) <= centavos <= MAX_ENTRY_FEE (100000)
- Methods: `platformFee(rate)`, `effectiveFee(discountPercent)`

### InviteCode
- `value: string` (readonly, 8 chars)
- Factory: `InviteCode.generate()`, `InviteCode.from(value: string)`
- Charset: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excl. 0, 1, I, O)

### PoolStatus
- `value: 'pending' | 'active' | 'closed' | 'cancelled'` (readonly)
- Static instances: `Pending`, `Active`, `Closed`, `Cancelled`
- Factory: `PoolStatus.from(value: string)`
- Methods: `canClose()`, `canCancel()`, `canJoin()`, `canAcceptPredictions()`
- State transitions:
  - pending → active (on payment)
  - active → closed (all matches done)
  - active → cancelled (owner cancels)
  - pending → cancelled (owner cancels)

### MatchdayRange
- `from: number`, `to: number` (readonly)
- Factory: `MatchdayRange.create(from, to)` → returns `MatchdayRange | null`
- Validation: Both must be set or both null; from <= to
- Methods: `contains(matchday: number)`

### PixKey
- `type: 'cpf' | 'email' | 'phone' | 'random'`, `value: string` (readonly)
- Factory: `PixKey.create(type, value)`
- Validation: CPF=11 digits, Email=valid format, Phone=+55 format, Random=UUID
- Methods: `masked()` — hides all but last 4 chars

### Score (domain/scoring/)
- `points: number` (readonly)
- Factory: `Score.calculate(predictedHome, predictedAway, actualHome, actualAway)`
- Scoring rules:
  - Exact match: 10 pts (SCORING.EXACT_MATCH)
  - Winner + goal difference (excl. draws): 7 pts (SCORING.WINNER_AND_DIFF)
  - Correct outcome: 5 pts (SCORING.OUTCOME_CORRECT)
  - Miss: 0 pts (SCORING.MISS)
- Methods: `isExact` (getter)

## Entities (domain/)

### Pool (domain/pool/)
- Fields:
  - `id: string`
  - `name: string`
  - `entryFee: EntryFee`
  - `ownerId: string`
  - `inviteCode: InviteCode`
  - `competitionId: string`
  - `matchdayRange: MatchdayRange | null`
  - `status: PoolStatus` (mutable via methods)
  - `isOpen: boolean` (mutable via methods)
  - `couponId: string | null`
- Methods:
  - `activate()` → sets status to Active
  - `close()` → validates canClose(), sets status to Closed, isOpen = false
  - `cancel()` → validates canCancel(), sets status to Cancelled, isOpen = false
  - `canJoin()` → status.canJoin() && isOpen
  - `canAcceptPredictions()` → status.canAcceptPredictions()
  - `isOwnedBy(userId)` → boolean
  - `calculatePrize(memberCount, effectiveFeeRate)` → Money
  - `calculatePlatformFee(effectiveFeeRate)` → Money

### Prediction (domain/prediction/)
- Fields:
  - `id: string | null`
  - `userId: string`
  - `poolId: string`
  - `matchId: string`
  - `homeScore: number`
  - `awayScore: number`
  - `points: number | null` (mutable via calculatePoints)
- Methods:
  - `calculatePoints(actualHome, actualAway)` → updates points using Score
- Static:
  - `canSubmit(matchDate: Date)` → boolean (matchDate > now)

### PrizeCalculation (domain/prize/)
- Domain service (not entity — stateless calculation)
- Static methods:
  - `calculatePrizeTotal(entryFee, memberCount, effectiveFeeRate)` → Money
  - `calculateWinnerShare(prizeTotal, winnerCount)` → Money

## Repository Ports (domain/)

### PoolRepository (domain/pool/)
```
findById(id: string): Promise<Pool | null>
findByInviteCode(code: string): Promise<PoolWithDetails | null>
findActiveByCompetition(competitionId: string): Promise<Pool[]>
save(pool: Pool): Promise<Pool>
updateStatus(id: string, status: PoolStatus): Promise<void>
getMemberCount(poolId: string): Promise<number>
isMember(poolId: string, userId: string): Promise<boolean>
addMember(poolId: string, userId: string, paymentId: string): Promise<void>
removeMember(poolId: string, userId: string): Promise<void>
findUserPools(userId: string): Promise<PoolListItem[]>
```

### PredictionRepository (domain/prediction/)
```
findByUserPoolMatch(userId, poolId, matchId): Promise<Prediction | null>
findByUserPool(userId, poolId): Promise<PredictionWithMatch[]>
findByPoolMatch(poolId, matchId): Promise<PredictionWithUser[]>
save(prediction: Prediction): Promise<Prediction>
updatePoints(id: string, points: number): Promise<void>
findByMatch(matchId: string): Promise<Prediction[]>
```

### PrizeWithdrawalRepository (domain/prize/)
```
findByPoolAndUser(poolId, userId): Promise<PrizeWithdrawal | null>
createWithPayment(data: WithdrawalData): Promise<PrizeWithdrawal>
```

### MatchRepository (domain/match/) — simplified
```
findById(id: string): Promise<Match | null>
findByCompetition(competitionId, filters): Promise<Match[]>
findLive(): Promise<Match[]>
upsertMany(matches: MatchData[]): Promise<void>
updateScores(id, homeScore, awayScore, status): Promise<void>
```

### RankingRepository — simplified (application port)
```
getPoolRanking(poolId, userId): Promise<RankingEntry[]>
getPoolMemberCount(poolId): Promise<number>
```

## External Service Ports (application/ports/)

### PaymentGateway
```
createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
refund(paymentIntentId: string): Promise<void>
isConfigured(): boolean
```

### FootballDataApi
```
fetchMatches(competitionExternalId, season): Promise<ExternalMatch[]>
fetchLiveMatches(competitionExternalId, date): Promise<ExternalMatch[]>
```

### NotificationService
```
notifyWinners(poolName, winners, prizeShare): Promise<void>
notifyAdminWithdrawalRequest(userName, poolName, amount, pixKeyType, pixKey): Promise<void>
sendPredictionReminders(reminders: ReminderData[]): Promise<void>
```

## Persistence Model (unchanged)

The Drizzle schema in `db/schema/` remains unchanged. Mappers in `infrastructure/persistence/mappers/` handle conversion between Drizzle row types and domain entities/value objects.

Key mappings:
- `pool` row → `Pool` entity (status string → PoolStatus, entryFee number → EntryFee, inviteCode string → InviteCode)
- `prediction` row → `Prediction` entity (scores remain numbers, points nullable)
- `match` row → plain TS object (no domain entity for simplified domains)
