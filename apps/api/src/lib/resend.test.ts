import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('resend', () => {
  const mockSend = vi.fn().mockResolvedValue({ id: 'test-id' })
  return {
    Resend: vi.fn().mockImplementation(() => ({
      emails: { send: mockSend },
    })),
  }
})

import { Resend } from 'resend'
import { sendMagicLinkEmail, sendPredictionReminderEmail, sendWinnerEmail } from './resend'

describe('sendMagicLinkEmail', () => {
  let mockSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    const resendInstance = new Resend('test-key')
    mockSend = resendInstance.emails.send as ReturnType<typeof vi.fn>
  })

  it('sends email with correct parameters', async () => {
    await sendMagicLinkEmail('user@example.com', 'https://m5nita.app/verify?token=abc')

    expect(mockSend).toHaveBeenCalledOnce()
    const callArgs = mockSend.mock.calls[0]?.[0]
    expect(callArgs.from).toContain('M5nita')
    expect(callArgs.from).toContain('noreply@notifications.m5nita.com')
    expect(callArgs.to).toBe('user@example.com')
    expect(callArgs.subject).toContain('M5nita')
    expect(callArgs.html).toContain('https://m5nita.app/verify?token=abc')
    expect(callArgs.html).toContain('Acessar m5nita')
    expect(callArgs.html).toContain('15 minutos')
  })
})

describe('sendPredictionReminderEmail', () => {
  let mockSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_URL = 'https://m5nita.app'
    const resendInstance = new Resend('test-key')
    mockSend = resendInstance.emails.send as ReturnType<typeof vi.fn>
  })

  it('sends a branded reminder with the match list and predictions link', async () => {
    await sendPredictionReminderEmail({
      to: 'ana@example.com',
      userName: 'Ana',
      poolName: 'Bolão Copa',
      poolId: 'pool-9',
      matches: [{ homeTeam: 'Brasil', awayTeam: 'Argentina', minutesUntil: 30 }],
    })

    expect(mockSend).toHaveBeenCalledOnce()
    const callArgs = mockSend.mock.calls[0]?.[0]
    expect(callArgs.from).toContain('noreply@notifications.m5nita.com')
    expect(callArgs.to).toBe('ana@example.com')
    expect(callArgs.subject).toContain('Bolão Copa')
    expect(callArgs.html).toContain('Brasil')
    expect(callArgs.html).toContain('Argentina')
    expect(callArgs.html).toContain('em 30 min')
    expect(callArgs.html).toContain('https://m5nita.app/pools/pool-9/predictions')
    expect(callArgs.html).toContain('Fazer palpites')
  })

  it('falls back to a text instruction when APP_URL is empty', async () => {
    process.env.APP_URL = ''
    await sendPredictionReminderEmail({
      to: 'ana@example.com',
      userName: null,
      poolName: 'Bolão Copa',
      poolId: 'pool-9',
      matches: [{ homeTeam: 'Brasil', awayTeam: 'Argentina', minutesUntil: 30 }],
    })

    const callArgs = mockSend.mock.calls[0]?.[0]
    expect(callArgs.html).toContain('Acesse o app para fazer seus palpites')
    expect(callArgs.html).not.toContain('/pools/pool-9/predictions')
  })
})

describe('sendWinnerEmail', () => {
  let mockSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.APP_URL = 'https://m5nita.app'
    const resendInstance = new Resend('test-key')
    mockSend = resendInstance.emails.send as ReturnType<typeof vi.fn>
  })

  it('sends a branded winner email with prize and withdrawal link', async () => {
    await sendWinnerEmail({
      to: 'maria@example.com',
      winnerName: 'Maria',
      poolName: 'Bolão Copa',
      prizeShare: 12345,
    })

    expect(mockSend).toHaveBeenCalledOnce()
    const callArgs = mockSend.mock.calls[0]?.[0]
    expect(callArgs.to).toBe('maria@example.com')
    expect(callArgs.subject).toContain('Bolão Copa')
    expect(callArgs.html).toContain('Maria')
    expect(callArgs.html).toContain('123,45')
    expect(callArgs.html).toContain('Solicitar retirada')
    expect(callArgs.html).toContain('https://m5nita.app')
  })
})
