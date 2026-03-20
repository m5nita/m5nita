import { z } from 'zod'

// Pool schemas
export const createPoolSchema = z.object({
  name: z.string().min(3).max(50),
  entryFee: z.number().int().min(100).max(100000),
  couponCode: z
    .string()
    .min(2)
    .max(20)
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, 'Código deve conter apenas letras e números'))
    .optional(),
})

// Coupon schemas
export const validateCouponSchema = z.object({
  couponCode: z
    .string()
    .min(2)
    .max(20)
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, 'Código deve conter apenas letras e números')),
  entryFee: z.number().int().min(100).max(100000),
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
export const phoneSchema = z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido')

// OTP schema
export const otpSchema = z.string().length(6).regex(/^\d+$/, 'Código deve ter 6 dígitos')
