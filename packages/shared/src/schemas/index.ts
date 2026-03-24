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

// PIX key schemas
const pixKeyCpfSchema = z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos')
const pixKeyEmailSchema = z.string().email('E-mail inválido')
const pixKeyPhoneSchema = z
  .string()
  .regex(/^\+55\d{10,11}$/, 'Telefone inválido (formato: +55XXXXXXXXXXX)')
const pixKeyRandomSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Chave aleatória deve estar no formato UUID',
  )

export const pixKeyTypeSchema = z.enum(['cpf', 'email', 'phone', 'random'])

export function validatePixKey(type: string, key: string): { success: boolean; error?: string } {
  const schemas: Record<string, z.ZodString> = {
    cpf: pixKeyCpfSchema,
    email: pixKeyEmailSchema,
    phone: pixKeyPhoneSchema,
    random: pixKeyRandomSchema,
  }
  const schema = schemas[type]
  if (!schema) return { success: false, error: 'Tipo de chave PIX inválido' }
  const result = schema.safeParse(key)
  if (!result.success) return { success: false, error: result.error.issues[0]?.message }
  return { success: true }
}

export const withdrawPrizeSchema = z.object({
  pixKeyType: pixKeyTypeSchema,
  pixKey: z.string().min(1, 'Chave PIX é obrigatória'),
})
