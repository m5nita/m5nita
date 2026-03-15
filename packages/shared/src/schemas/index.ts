import { z } from 'zod'

// Pool schemas
export const createPoolSchema = z.object({
  name: z.string().min(3).max(50),
  entryFee: z.number().int().min(1000).max(100000),
})

export const updatePoolSchema = z.object({
  name: z.string().min(3).max(50).optional(),
  isOpen: z.boolean().optional(),
})

// Prediction schemas
export const upsertPredictionSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
})

// User schemas
export const updateUserSchema = z.object({
  name: z.string().min(1).max(100),
})

// Phone schema
export const phoneSchema = z.string().regex(/^\+55\d{10,11}$/, 'Telefone invalido')

// OTP schema
export const otpSchema = z.string().length(6).regex(/^\d+$/, 'Codigo deve ter 6 digitos')
