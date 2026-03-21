import { eq } from 'drizzle-orm'
import { Bot } from 'grammy'
import { db } from '../db/client'
import { telegramChat } from '../db/schema/telegram'
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
        error: 'Formato de duracao invalido. Use Nd (ex: 30d).',
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
      error: 'Limite de usos deve ser um numero positivo.',
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
    await ctx.reply('Voce nao tem permissao para este comando.')
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
      `Cupom criado!\n\nCodigo: ${created.code}\nDesconto: ${created.discountPercent}% na taxa\nExpira: ${expiryText}\nLimite de usos: ${limitText}`,
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
    await ctx.reply('Voce nao tem permissao para este comando.')
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
    await ctx.reply('Voce nao tem permissao para este comando.')
    return
  }

  const code = ctx.match.trim()
  if (!code) {
    await ctx.reply('Uso: /cupom_desativar CODIGO')
    return
  }

  try {
    await deactivateCoupon(code)
    await ctx.reply(`Cupom ${code.toUpperCase()} desativado. Boloes existentes mantem o desconto.`)
  } catch (error) {
    if (error instanceof CouponError) {
      await ctx.reply(error.message)
      return
    }
    throw error
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
