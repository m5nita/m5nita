import { eq } from 'drizzle-orm'
import { Bot } from 'grammy'
// Cycle with ../container (which imports `bot` from this file). Only safe because
// getContainer() is invoked lazily inside handlers — never hoist to module scope.
import { getContainer } from '../container'
import { db } from '../db/client'
import { telegramChat } from '../db/schema/telegram'
import { PrizeWithdrawalError } from '../domain/prize/PrizeWithdrawalError'
import { WITHDRAWAL_PAY_CALLBACK_PREFIX } from '../infrastructure/external/telegramCallbacks'
import {
  CompetitionError,
  createCompetition,
  deactivateCompetition,
  listCompetitions,
  toggleFeatured,
} from '../services/competition'
import { CouponError, createCoupon, deactivateCoupon, listCoupons } from '../services/coupon'
import { isAdmin } from './admin'

export const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '')

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Bem-vindo ao m5nita!\n\nToque no botão abaixo para compartilhar seu número. Não digite — use o botão.',
    {
      reply_markup: {
        keyboard: [[{ text: '📱 Compartilhar telefone', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
  )
})

bot.on('message:contact', async (ctx) => {
  const contact = ctx.message.contact
  const chatId = ctx.from.id
  const phone = contact.phone_number.startsWith('+')
    ? contact.phone_number
    : `+${contact.phone_number}`

  await db
    .insert(telegramChat)
    .values({
      phoneNumber: phone,
      chatId: chatId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramChat.phoneNumber,
      set: {
        chatId: chatId,
        updatedAt: new Date(),
      },
    })

  await ctx.reply('Pronto! Agora você pode fazer login no m5nita.', {
    reply_markup: { remove_keyboard: true },
  })
})

function parseCouponArgs(args: string[]): {
  error?: string
  code: string
  discountPercent: number
  expiresAt: Date | null
  maxUses: number | null
} {
  if (args.length < 2) {
    return {
      error: 'Uso: /cupom_criar CODIGO_DESCONTO [DIAS] [MAX_USOS]',
      code: '',
      discountPercent: 0,
      expiresAt: null,
      maxUses: null,
    }
  }

  const code = args[0] as string
  const discountPercent = Number.parseInt(args[1] as string, 10)

  if (Number.isNaN(discountPercent) || discountPercent < 1 || discountPercent > 100) {
    return {
      error: 'Desconto deve ser entre 1 e 100.',
      code,
      discountPercent,
      expiresAt: null,
      maxUses: null,
    }
  }

  let expiresAt: Date | null = null
  if (args[2]) {
    const daysMatch = args[2].match(/^(\d+)d$/)
    if (!daysMatch) {
      return {
        error: 'Formato de duração inválido. Use Nd (ex: 30d).',
        code,
        discountPercent,
        expiresAt: null,
        maxUses: null,
      }
    }
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + Number.parseInt(daysMatch[1] as string, 10))
  }

  const maxUses = args[3] ? Number.parseInt(args[3], 10) : null
  if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 1)) {
    return {
      error: 'Limite de usos deve ser um número positivo.',
      code,
      discountPercent,
      expiresAt,
      maxUses: null,
    }
  }

  return { code, discountPercent, expiresAt, maxUses }
}

bot.command('cupom_criar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const args = ctx.match.split(/\s+/).filter(Boolean)
  const parsed = parseCouponArgs(args)

  if (parsed.error) {
    await ctx.reply(parsed.error)
    return
  }

  try {
    const created = await createCoupon({
      code: parsed.code,
      discountPercent: parsed.discountPercent,
      expiresAt: parsed.expiresAt,
      maxUses: parsed.maxUses,
      createdByTelegramId: ctx.from.id,
    })

    const expiryText = created.expiresAt ? created.expiresAt.toLocaleDateString('pt-BR') : 'Nunca'
    const limitText = created.maxUses !== null ? String(created.maxUses) : 'Ilimitado'

    await ctx.reply(
      `Cupom criado!\n\nCódigo: ${created.code}\nDesconto: ${created.discountPercent}% na taxa\nExpira: ${expiryText}\nLimite de usos: ${limitText}`,
    )
  } catch (error) {
    if (error instanceof CouponError) {
      await ctx.reply(error.message)
      return
    }
    throw error
  }
})

bot.command('cupom_listar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const coupons = await listCoupons()

  if (coupons.length === 0) {
    await ctx.reply('Nenhum cupom cadastrado.')
    return
  }

  const lines = coupons.map((c, i) => {
    const usesText = c.maxUses !== null ? `${c.useCount}/${c.maxUses}` : `${c.useCount}/ilimitado`
    const statusText = c.status === 'active' ? 'Ativo' : 'Inativo'
    const expiryText = c.expiresAt
      ? c.expiresAt < new Date()
        ? 'Expirado'
        : `Expira ${c.expiresAt.toLocaleDateString('pt-BR')}`
      : 'Nunca expira'
    return `${i + 1}. ${c.code} - ${c.discountPercent}% off - ${statusText} - ${usesText} usos - ${expiryText}`
  })

  await ctx.reply(`Cupons (${coupons.length}):\n\n${lines.join('\n')}`)
})

bot.command('cupom_desativar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const code = ctx.match.trim()
  if (!code) {
    await ctx.reply('Uso: /cupom_desativar CODIGO')
    return
  }

  try {
    await deactivateCoupon(code)
    await ctx.reply(`Cupom ${code.toUpperCase()} desativado. Bolões existentes mantêm o desconto.`)
  } catch (error) {
    if (error instanceof CouponError) {
      await ctx.reply(error.message)
      return
    }
    throw error
  }
})

function parseCompetitionArgs(raw: string): {
  error?: string
  code: string
  name: string
  season: number
  type: string
} {
  const quotedMatch = raw.match(/^(\S+)\s+["""]([^"""]+)["""]\s+(\S+)\s+(\S+)$/)
  if (quotedMatch) {
    const code = quotedMatch[1] as string
    const name = quotedMatch[2] as string
    const season = Number.parseInt(quotedMatch[3] as string, 10)
    const type = quotedMatch[4] as string
    if (Number.isNaN(season)) {
      return { error: 'Temporada deve ser um número (ex: 2025).', code, name, season, type }
    }
    if (type !== 'cup' && type !== 'league') {
      return { error: 'Tipo deve ser "cup" ou "league".', code, name, season, type }
    }
    return { code, name, season, type }
  }

  const args = raw.split(/\s+/).filter(Boolean)
  if (args.length < 4) {
    return {
      error: 'Uso: /competicao_criar CODIGO "Nome" TEMPORADA TIPO',
      code: '',
      name: '',
      season: 0,
      type: '',
    }
  }

  const code = args[0] as string
  const name = args[1] as string
  const season = Number.parseInt(args[2] as string, 10)
  const type = args[3] as string

  if (Number.isNaN(season)) {
    return { error: 'Temporada deve ser um número (ex: 2025).', code, name, season, type }
  }
  if (type !== 'cup' && type !== 'league') {
    return { error: 'Tipo deve ser "cup" ou "league".', code, name, season, type }
  }

  return { code, name, season, type }
}

bot.command('competicao_criar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const raw = ctx.match.trim()
  const parsed = parseCompetitionArgs(raw)

  if (parsed.error) {
    await ctx.reply(parsed.error)
    return
  }

  try {
    const created = await createCompetition(
      parsed.code,
      parsed.name,
      String(parsed.season),
      parsed.type,
    )

    await ctx.reply(
      `Competição criada!\n\nCódigo: ${created.externalId}\nNome: ${created.name}\nTemporada: ${created.season}\nTipo: ${created.type}`,
    )
  } catch (error) {
    if (error instanceof CompetitionError) {
      await ctx.reply(error.message)
      return
    }
    throw error
  }
})

bot.command('competicao_listar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const competitions = await listCompetitions()

  if (competitions.length === 0) {
    await ctx.reply('Nenhuma competição cadastrada.')
    return
  }

  const lines = competitions.map((c, i) => {
    const statusText = c.status === 'active' ? 'Ativo' : 'Inativo'
    const featuredText = c.featured ? ' [Destaque]' : ''
    return `${i + 1}. ${c.externalId} - ${c.name} - ${c.season} - ${c.type} - ${statusText}${featuredText}`
  })

  await ctx.reply(`Competições (${competitions.length}):\n\n${lines.join('\n')}`)
})

bot.command('competicao_desativar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const args = ctx.match.split(/\s+/).filter(Boolean)
  if (args.length < 2) {
    await ctx.reply('Uso: /competicao_desativar CODIGO TEMPORADA')
    return
  }

  const code = args[0] as string
  const season = args[1] as string

  if (!/^\d{4}$/.test(season)) {
    await ctx.reply('Temporada deve ser um ano (ex: 2025).')
    return
  }

  try {
    await deactivateCompetition(code, season)
    await ctx.reply(`Competição ${code.toUpperCase()} (${season}) desativada.`)
  } catch (error) {
    if (error instanceof CompetitionError) {
      await ctx.reply(error.message)
      return
    }
    throw error
  }
})

bot.command('competicao_destacar', async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.reply('Você não tem permissão para este comando.')
    return
  }

  const args = ctx.match.split(/\s+/).filter(Boolean)
  if (args.length < 2) {
    await ctx.reply('Uso: /competicao_destacar CODIGO TEMPORADA')
    return
  }

  const code = args[0] as string
  const season = args[1] as string

  if (!/^\d{4}$/.test(season)) {
    await ctx.reply('Temporada deve ser um ano (ex: 2025).')
    return
  }

  try {
    const updated = await toggleFeatured(code, season)
    const status = updated.featured ? 'destacada' : 'removida dos destaques'
    await ctx.reply(`Competição ${code.toUpperCase()} (${season}) ${status}.`)
  } catch (error) {
    if (error instanceof CompetitionError) {
      await ctx.reply(error.message)
      return
    }
    throw error
  }
})

bot.callbackQuery(new RegExp(`^${WITHDRAWAL_PAY_CALLBACK_PREFIX}(.+)$`), async (ctx) => {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: 'Sem permissão', show_alert: true })
    return
  }

  const withdrawalId = ctx.match?.[1]
  if (!withdrawalId) {
    await ctx.answerCallbackQuery({ text: 'Callback inválido', show_alert: true })
    return
  }

  try {
    const { markWithdrawalPaidUseCase } = getContainer()
    await markWithdrawalPaidUseCase.execute({ withdrawalId })

    const originalText = ctx.callbackQuery.message?.text ?? ''
    const handle = ctx.from.username ? `@${ctx.from.username}` : (ctx.from.first_name ?? 'admin')
    const paidAt = new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const footer = `\n\n✅ Pago em ${paidAt} por ${handle}`

    await ctx.editMessageText(originalText + footer, {
      reply_markup: { inline_keyboard: [] },
    })
    await ctx.answerCallbackQuery({ text: 'Marcado como pago' })
  } catch (error) {
    if (error instanceof PrizeWithdrawalError) {
      if (error.code === 'WITHDRAWAL_ALREADY_COMPLETED') {
        await ctx.answerCallbackQuery({
          text: 'Já foi marcado como pago',
          show_alert: true,
        })
        return
      }
      if (error.code === 'WITHDRAWAL_NOT_FOUND') {
        console.error('[Telegram] markAsCompleted: withdrawal not found', withdrawalId)
        await ctx.answerCallbackQuery({
          text: 'Erro ao processar. Tente novamente.',
          show_alert: true,
        })
        return
      }
    }
    console.error('[Telegram] callbackQuery wd:pay failed:', error)
    await ctx.answerCallbackQuery({
      text: 'Erro ao processar. Tente novamente.',
      show_alert: true,
    })
  }
})

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return

  await ctx.reply(
    'Não digite seu número aqui. Toque no botão "Compartilhar telefone" abaixo para continuar.',
    {
      reply_markup: {
        keyboard: [[{ text: 'Compartilhar telefone', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
  )
})

export async function sendOtpViaTelegram(chatId: number, code: string): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, `Seu código m5nita: *${code}*`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '📋 Copiar código', copy_text: { text: code } }]],
      },
    })
  } catch (error) {
    console.error('[Telegram] Failed to send OTP:', error)
    throw new Error('Falha ao enviar código. Tente novamente.')
  }
}

export async function findChatIdByPhone(phone: string): Promise<number | null> {
  const result = await db
    .select({ chatId: telegramChat.chatId })
    .from(telegramChat)
    .where(eq(telegramChat.phoneNumber, phone))
    .limit(1)

  return result[0]?.chatId ?? null
}
