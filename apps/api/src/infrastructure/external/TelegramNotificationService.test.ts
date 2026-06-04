import { describe, expect, it, vi } from 'vitest'

function makeBot() {
  return {
    api: {
      sendMessage: vi.fn(async () => ({})),
    },
  } as unknown as import('grammy').Bot
}

function sendMessageCalls(bot: import('grammy').Bot) {
  return (bot.api.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

describe('TelegramNotificationService.sendWinnerMessage', () => {
  it('includes APP_URL on its own line when set', async () => {
    process.env.APP_URL = 'https://example.test'
    vi.resetModules()
    const { TelegramNotificationService } = await import('./TelegramNotificationService')
    const bot = makeBot()
    const svc = new TelegramNotificationService(bot)
    await svc.sendWinnerMessage(12345, {
      poolName: 'Bolão Teste',
      winnerName: 'Igor',
      prizeShare: 10000,
    })

    const calls = sendMessageCalls(bot)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(12345)
    const message = calls[0]?.[1] as string
    expect(message).toContain('Parabéns, Igor')
    expect(message).toContain('Acesse para solicitar a retirada:')
    expect(message).toContain('https://example.test')
    expect(message).not.toMatch(/\[.*\]\(https:\/\/example\.test\)/)
  })

  it('omits the link when APP_URL is empty and still sends the core message', async () => {
    process.env.APP_URL = ''
    vi.resetModules()
    const { TelegramNotificationService } = await import('./TelegramNotificationService')
    const bot = makeBot()
    const svc = new TelegramNotificationService(bot)
    await expect(
      svc.sendWinnerMessage(12345, {
        poolName: 'Bolão Teste',
        winnerName: 'Igor',
        prizeShare: 10000,
      }),
    ).resolves.toBeUndefined()

    const calls = sendMessageCalls(bot)
    expect(calls).toHaveLength(1)
    const message = calls[0]?.[1] as string
    expect(message).not.toContain('http')
    expect(message).toContain('Bolão Teste')
    expect(message).toContain('Acesse o app para solicitar')
  })
})

describe('TelegramNotificationService.sendReminderMessage', () => {
  it('formats the match list with a predictions deep link', async () => {
    process.env.APP_URL = 'https://example.test'
    vi.resetModules()
    const { TelegramNotificationService } = await import('./TelegramNotificationService')
    const bot = makeBot()
    const svc = new TelegramNotificationService(bot)
    await svc.sendReminderMessage(999, {
      poolName: 'Bolão Teste',
      poolId: 'pool-1',
      matches: [{ homeTeam: 'Brasil', awayTeam: 'Argentina', minutesUntil: 30 }],
    })

    const calls = sendMessageCalls(bot)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(999)
    const message = calls[0]?.[1] as string
    expect(message).toContain('Brasil x Argentina')
    expect(message).toContain('em 30 min')
    expect(message).toContain('https://example.test/pools/pool-1/predictions')
  })
})
