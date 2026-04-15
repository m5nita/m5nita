import { z } from 'zod'

// Pool schemas
export const createPoolSchema = z
  .object({
    name: z.string().min(3).max(50),
    entryFee: z.number().int().min(100).max(100000),
    competitionId: z.string().uuid('ID da competicao invalido'),
    matchdayFrom: z.number().int().min(1).optional(),
    matchdayTo: z.number().int().min(1).optional(),
    couponCode: z
      .string()
      .min(2)
      .max(20)
      .transform((v) => v.trim().toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]+$/, 'Código deve conter apenas letras e números'))
      .optional(),
  })
  .refine(
    (data) => {
      if (data.matchdayFrom != null && data.matchdayTo == null) return false
      if (data.matchdayFrom == null && data.matchdayTo != null) return false
      return true
    },
    { message: 'matchdayFrom e matchdayTo devem ser informados juntos', path: ['matchdayTo'] },
  )
  .refine(
    (data) => {
      if (data.matchdayFrom != null && data.matchdayTo != null) {
        return data.matchdayFrom <= data.matchdayTo
      }
      return true
    },
    { message: 'matchdayFrom deve ser menor ou igual a matchdayTo', path: ['matchdayFrom'] },
  )

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

// Affiliate coupon schemas
export const createAffiliateCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(20)
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, 'Código deve conter apenas letras e números')),
  discountPercent: z.number().int().min(0).max(99),
  commissionPercent: z.number().int().min(1).max(99),
  beneficiary: z.object({
    name: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(1, 'Nome é obrigatório').max(100)),
    pix: z.object({
      type: pixKeyTypeSchema,
      value: z.string().min(1, 'Chave PIX é obrigatória'),
    }),
  }),
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .nullable()
    .transform((v) => (v ? new Date(v) : null)),
  maxUses: z.number().int().min(1).optional().nullable(),
})

export const recordAffiliatePayoutSchema = z.object({
  amountCentavos: z.number().int().positive(),
  paidAt: z
    .string()
    .datetime()
    .refine((v) => new Date(v) <= new Date(), 'paidAt não pode estar no futuro')
    .transform((v) => new Date(v)),
  externalReference: z.string().max(200).optional().nullable(),
})
