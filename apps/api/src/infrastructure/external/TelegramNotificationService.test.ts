import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/telegram', () => ({
  findChatIdByPhone: vi.fn(async () => 12345),
}))

function makeBot() {
  return {
    api: {
      sendMessage: vi.fn(async () => ({})),
    },
  } as unknown as import('grammy').Bot
}

describe('TelegramNotificationService.notifyWinners', () => {
  it('includes APP_URL on its own line when set', async () => {
    process.env.APP_URL = 'https://example.test'
    vi.resetModules()
    const { TelegramNotificationService } = await import('./TelegramNotificationService')
    const bot = makeBot()
    const svc = new TelegramNotificationService(bot)
    await svc.notifyWinners('Bolão Teste', [{ name: 'Igor', phoneNumber: '+5511999999999' }], 10000)

    const calls = (bot.api.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls).toHaveLength(1)
    const message = calls[0]?.[1] as string
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
      svc.notifyWinners('Bolão Teste', [{ name: 'Igor', phoneNumber: '+5511999999999' }], 10000),
    ).resolves.toBeUndefined()

    const calls = (bot.api.sendMessage as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls).toHaveLength(1)
    const message = calls[0]?.[1] as string
    expect(message).not.toContain('http')
    expect(message).toContain('Bolão Teste')
    expect(message).toContain('Acesse o app para solicitar')
  })
})
