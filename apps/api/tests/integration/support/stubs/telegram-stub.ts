/**
 * Minimal Telegram bot stub satisfying the surface used by TelegramNotificationService.
 * The real grammY Bot's api.sendMessage is the only method our production notification
 * service calls, so the stub mirrors that shape.
 */

import type { StubCallLog } from './types'

type SentMessage = {
  chatId: number
  text: string
  options?: unknown
}

const state = {
  sends: [] as SentMessage[],
  calls: [] as StubCallLog[],
}

async function sendMessage(chatId: number, text: string, options?: unknown) {
  state.sends.push({ chatId, text, options })
  state.calls.push({
    provider: 'telegram',
    timestamp: new Date().toISOString(),
    direction: 'outbound',
    summary: `sendMessage(chatId=${chatId}, text="${text.slice(0, 40).replace(/\n/g, ' ')}")`,
  })
  return { message_id: state.sends.length, chat: { id: chatId }, text }
}

export const telegramStub = {
  bot: {
    api: {
      sendMessage,
    },
  } as const,
  sends(): SentMessage[] {
    return [...state.sends]
  },
  lastSend(chatId?: number): SentMessage | null {
    for (let i = state.sends.length - 1; i >= 0; i--) {
      const s = state.sends[i]
      if (s && (chatId === undefined || s.chatId === chatId)) return s
    }
    return null
  },
  reset() {
    state.sends = []
    state.calls = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
