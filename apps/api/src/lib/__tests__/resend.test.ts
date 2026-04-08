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
import { sendMagicLinkEmail } from '../resend'

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
    expect(callArgs.from).toContain('noreply@m5nita.app')
    expect(callArgs.to).toBe('user@example.com')
    expect(callArgs.subject).toContain('M5nita')
    expect(callArgs.html).toContain('https://m5nita.app/verify?token=abc')
    expect(callArgs.html).toContain('Acessar M5nita')
    expect(callArgs.html).toContain('15 minutos')
  })
})
