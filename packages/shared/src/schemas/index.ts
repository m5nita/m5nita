import { z } from 'zod'
import { isValidCpf } from '../lib/cpf'

// Strips HTML tags/entities and trims. Pool names are rendered in email
// templates and Telegram messages where React's auto-escape doesn't help.
const safePoolName = z
  .string()
  .trim()
  .transform((v) => v.replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, ''))
  .pipe(z.string().min(3, 'Nome muito curto').max(50, 'Nome muito longo'))

// Pool schemas
export const createPoolSchema = z
  .object({
    name: safePoolName,
    entryFee: z.number().int().min(500).max(100000),
    competitionId: z.string().uuid('ID da competicao invalido'),
    matchdayFrom: z.number().int().min(1).optional(),
    matchdayTo: z.number().int().min(1).optional(),
    matchId: z.string().uuid('ID do jogo inválido').optional(),
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
  .refine(
    (data) => {
      // FR-001 / FR-002: matchId is mutually exclusive with the matchday range.
      if (data.matchId != null && (data.matchdayFrom != null || data.matchdayTo != null))
        return false
      return true
    },
    { message: 'Escolha um único jogo OU uma faixa de rodadas, não ambos', path: ['matchId'] },
  )

// Coupon schemas
export const validateCouponSchema = z.object({
  couponCode: z
    .string()
    .min(2)
    .max(20)
    .transform((v) => v.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]+$/, 'Código deve conter apenas letras e números')),
  entryFee: z.number().int().min(500).max(100000),
})

export const updatePoolSchema = z.object({
  name: safePoolName.optional(),
  isOpen: z.boolean().optional(),
})

// Prediction schemas
export const upsertPredictionSchema = z.object({
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
  // Knockout only: which side advances past regular time. Stored only for knockout matches.
  advancePick: z.enum(['home', 'away']).nullish(),
})

// Phone schema
export const phoneSchema = z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido')

// OTP schema
export const otpSchema = z.string().length(6).regex(/^\d+$/, 'Código deve ter 6 dígitos')

// PIX key schemas
// Accepts a CPF either plain (12345678909) or formatted (123.456.789-09);
// `isValidCpf` strips the dots/dash before checking the verification digits.
const pixKeyCpfSchema = z
  .string()
  .regex(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF deve ter 11 dígitos')
  .refine(isValidCpf, 'CPF inválido')
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
  const schemas: Record<string, z.ZodType<string>> = {
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
