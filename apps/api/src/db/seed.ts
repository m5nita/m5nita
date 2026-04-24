import { db } from './client'
import { user } from './schema/auth'
import { competition } from './schema/competition'
import { match } from './schema/match'
import { payment } from './schema/payment'
import { pool } from './schema/pool'
import { poolMember } from './schema/poolMember'
import { prediction } from './schema/prediction'
import { prizeWithdrawal } from './schema/prizeWithdrawal'

async function seed() {
  console.log('Seeding database...')

  // Users
  const [user1] = await db
    .insert(user)
    .values({
      id: 'user-1',
      name: 'Igor',
      phoneNumber: '+5511999999999',
      phoneNumberVerified: true,
      emailVerified: false,
    })
    .returning()

  const [user2] = await db
    .insert(user)
    .values({
      id: 'user-2',
      name: 'Maria',
      phoneNumber: '+5511888888888',
      phoneNumberVerified: true,
      emailVerified: false,
    })
    .returning()

  const [user3] = await db
    .insert(user)
    .values({
      id: 'user-3',
      name: 'Pedro',
      phoneNumber: '+5511777777777',
      phoneNumberVerified: true,
      emailVerified: false,
    })
    .returning()

  console.log('Users created:', user1?.id, user2?.id, user3?.id)

  // Competition
  const competitionId = '00000000-0000-0000-0000-000000000001'
  await db.insert(competition).values({
    id: competitionId,
    externalId: 'WC',
    name: 'Copa do Mundo 2026',
    season: '2026',
    type: 'cup',
    status: 'active',
  })

  console.log('Competition created:', competitionId)

  // Pool
  const [pool1] = await db
    .insert(pool)
    .values({
      name: 'Bolão da Galera',
      entryFee: 5000,
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      ownerId: user1!.id,
      inviteCode: 'GALERA26',
      competitionId,
    })
    .returning()

  console.log('Pool created:', pool1?.id)

  // Payments
  // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
  for (const u of [user1!, user2!, user3!]) {
    const [pay] = await db
      .insert(payment)
      .values({
        userId: u.id,
        // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
        poolId: pool1!.id,
        amount: 5000,
        platformFee: 250,
        status: 'completed',
        type: 'entry',
      })
      .returning()

    await db.insert(poolMember).values({
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      poolId: pool1!.id,
      userId: u.id,
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      paymentId: pay!.id,
    })
  }

  console.log('Members added to pool')

  // Sample matches (Group A)
  const sampleMatches = [
    {
      homeTeam: 'Brasil',
      awayTeam: 'Alemanha',
      stage: 'group',
      group: 'A',
      matchDate: new Date('2026-06-11T18:00:00Z'),
      status: 'scheduled',
      externalId: 1001,
      competitionId,
    },
    {
      homeTeam: 'Argentina',
      awayTeam: 'Franca',
      stage: 'group',
      group: 'A',
      matchDate: new Date('2026-06-11T21:00:00Z'),
      status: 'scheduled',
      externalId: 1002,
      competitionId,
    },
    {
      homeTeam: 'Brasil',
      awayTeam: 'Franca',
      stage: 'group',
      group: 'A',
      matchDate: new Date('2026-06-15T18:00:00Z'),
      status: 'finished',
      homeScore: 2,
      awayScore: 1,
      externalId: 1003,
      competitionId,
    },
    {
      homeTeam: 'Alemanha',
      awayTeam: 'Argentina',
      stage: 'group',
      group: 'A',
      matchDate: new Date('2026-06-15T21:00:00Z'),
      status: 'finished',
      homeScore: 1,
      awayScore: 1,
      externalId: 1004,
      competitionId,
    },
  ]

  for (const m of sampleMatches) {
    await db.insert(match).values(m)
  }

  console.log('Sample matches created')

  // Sample predictions for finished matches
  const finishedMatches = await db.query.match.findMany({
    where: (m, { eq }) => eq(m.status, 'finished'),
  })

  for (const m of finishedMatches) {
    await db.insert(prediction).values({
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      userId: user1!.id,
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      poolId: pool1!.id,
      matchId: m.id,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      points: 10, // Exact match
    })

    await db.insert(prediction).values({
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      userId: user2!.id,
      // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
      poolId: pool1!.id,
      matchId: m.id,
      homeScore: (m.homeScore ?? 0) + 1,
      awayScore: m.awayScore ?? 0,
      points: 5, // Correct winner
    })
  }

  console.log('Sample predictions created')

  // --- Prize scenarios (closed pools) ---
  async function createClosedScenario(options: {
    name: string
    inviteCode: string
    members: { user: NonNullable<typeof user1>; points: number; isWinner: boolean }[]
    requestWithdrawalFor?: string | null
  }) {
    const [p] = await db
      .insert(pool)
      .values({
        name: options.name,
        entryFee: 5000,
        // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
        ownerId: user1!.id,
        inviteCode: options.inviteCode,
        competitionId,
        status: 'closed',
        isOpen: false,
      })
      .returning()

    // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
    const poolId = p!.id

    // Payments + memberships
    for (const m of options.members) {
      const [pay] = await db
        .insert(payment)
        .values({
          userId: m.user.id,
          poolId,
          amount: 5000,
          platformFee: 250,
          status: 'completed',
          type: 'entry',
        })
        .returning()
      await db.insert(poolMember).values({
        poolId,
        userId: m.user.id,
        // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
        paymentId: pay!.id,
      })
    }

    // One finished match used as the prediction target
    const [finishedMatch] = await db
      .insert(match)
      .values({
        homeTeam: 'Time A',
        awayTeam: 'Time B',
        stage: 'group',
        group: 'A',
        matchDate: new Date('2026-06-10T18:00:00Z'),
        status: 'finished',
        homeScore: 2,
        awayScore: 1,
        externalId: 9000 + Math.floor(Math.random() * 10000),
        competitionId,
      })
      .returning()
    // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
    const matchId = finishedMatch!.id

    // Predictions — points drive the ranking
    for (const m of options.members) {
      await db.insert(prediction).values({
        userId: m.user.id,
        poolId,
        matchId,
        homeScore: 2,
        awayScore: 1,
        points: m.points,
      })
    }

    // Optional withdrawal row (already-requested scenario)
    if (options.requestWithdrawalFor) {
      const winnerCount = options.members.filter((m) => m.isWinner).length
      const totalEntries = options.members.length * 5000
      const totalFees = options.members.length * 250
      const prizePool = totalEntries - totalFees
      const share = Math.floor(prizePool / winnerCount)

      const [prizePay] = await db
        .insert(payment)
        .values({
          userId: options.requestWithdrawalFor,
          poolId,
          amount: share,
          platformFee: 0,
          status: 'pending',
          type: 'prize',
        })
        .returning()

      // NOTE: pixKey is stored as ciphertext in production via encryptPixKey().
      // Seeding with a plaintext value is intentional for local dev — the masked
      // value on the UI hides the raw content. Regenerate with an encrypted value
      // if decryptPixKey() throws during manual testing.
      await db.insert(prizeWithdrawal).values({
        poolId,
        userId: options.requestWithdrawalFor,
        // biome-ignore lint/style/noNonNullAssertion: seed script assumes successful inserts
        paymentId: prizePay!.id,
        amount: share,
        pixKeyType: 'cpf',
        pixKey: '12345678909',
        status: 'pending',
      })
    }

    console.log(`Closed pool created: ${options.name} (id=${poolId})`)
  }

  // Scenario 1: Igor won solo, no withdrawal yet
  await createClosedScenario({
    name: 'Bolão da Copa Passada',
    inviteCode: 'PASSADA26',
    members: [
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user1!, points: 30, isWinner: true },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user2!, points: 15, isWinner: false },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user3!, points: 10, isWinner: false },
    ],
  })

  // Scenario 2: Igor won solo, withdrawal already pending
  await createClosedScenario({
    name: 'Bolão Já Solicitado',
    inviteCode: 'SOLICITADO26',
    members: [
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user1!, points: 30, isWinner: true },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user2!, points: 15, isWinner: false },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user3!, points: 10, isWinner: false },
    ],
    // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
    requestWithdrawalFor: user1!.id,
  })

  // Scenario 3: Maria won, Igor did not
  await createClosedScenario({
    name: 'Bolão da Maria',
    inviteCode: 'MARIA26',
    members: [
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user1!, points: 10, isWinner: false },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user2!, points: 30, isWinner: true },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user3!, points: 15, isWinner: false },
    ],
  })

  // Scenario 4: Tie between Igor and Pedro
  await createClosedScenario({
    name: 'Bolão do Empate',
    inviteCode: 'EMPATE26',
    members: [
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user1!, points: 30, isWinner: true },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user3!, points: 30, isWinner: true },
      // biome-ignore lint/style/noNonNullAssertion: seed assumes users exist
      { user: user2!, points: 10, isWinner: false },
    ],
  })

  console.log('Prize scenarios created')
  console.log('Seed complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
