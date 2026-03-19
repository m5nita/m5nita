import { relations } from 'drizzle-orm'
import { account, session, user } from './auth'
import { match } from './match'
import { payment } from './payment'
import { pool } from './pool'
import { poolMember } from './poolMember'
import { prediction } from './prediction'

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  pools: many(pool),
  poolMembers: many(poolMember),
  payments: many(payment),
  predictions: many(prediction),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const poolRelations = relations(pool, ({ one, many }) => ({
  owner: one(user, {
    fields: [pool.ownerId],
    references: [user.id],
  }),
  poolMembers: many(poolMember),
  payments: many(payment),
  predictions: many(prediction),
}))

export const poolMemberRelations = relations(poolMember, ({ one }) => ({
  pool: one(pool, {
    fields: [poolMember.poolId],
    references: [pool.id],
  }),
  user: one(user, {
    fields: [poolMember.userId],
    references: [user.id],
  }),
  payment: one(payment, {
    fields: [poolMember.paymentId],
    references: [payment.id],
  }),
}))

export const paymentRelations = relations(payment, ({ one }) => ({
  user: one(user, {
    fields: [payment.userId],
    references: [user.id],
  }),
  pool: one(pool, {
    fields: [payment.poolId],
    references: [pool.id],
  }),
}))

export const matchRelations = relations(match, ({ many }) => ({
  predictions: many(prediction),
}))

export const predictionRelations = relations(prediction, ({ one }) => ({
  user: one(user, {
    fields: [prediction.userId],
    references: [user.id],
  }),
  pool: one(pool, {
    fields: [prediction.poolId],
    references: [pool.id],
  }),
  match: one(match, {
    fields: [prediction.matchId],
    references: [match.id],
  }),
}))
