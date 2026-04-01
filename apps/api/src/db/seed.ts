import { db } from './client'
import { user } from './schema/auth'
import { competition } from './schema/competition'
import { match } from './schema/match'
import { payment } from './schema/payment'
import { pool } from './schema/pool'
import { poolMember } from './schema/poolMember'
import { prediction } from './schema/prediction'

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
  console.log('Seed complete!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
