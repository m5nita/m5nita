import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

type SentEmail = {
  to: string[]
  from: string
  subject: string
  html: string | null
  text: string | null
}

const state = {
  emails: [] as SentEmail[],
  calls: [] as StubCallLog[],
}

export const resendStub = {
  handlers: [
    http.post('https://api.resend.com/emails', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>
      const email: SentEmail = {
        to: Array.isArray(body.to) ? (body.to as string[]) : [String(body.to ?? '')],
        from: String(body.from ?? 'noreply@m5nita.test'),
        subject: String(body.subject ?? ''),
        html: typeof body.html === 'string' ? body.html : null,
        text: typeof body.text === 'string' ? body.text : null,
      }
      state.emails.push(email)
      state.calls.push({
        provider: 'resend',
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        summary: `emails.send(to=${email.to.join(',')}, subject="${email.subject}")`,
      })
      return HttpResponse.json({ id: `resend_${state.emails.length}` })
    }),
  ],
  emails(): SentEmail[] {
    return [...state.emails]
  },
  lastEmailFor(emailAddress: string): SentEmail | null {
    for (let i = state.emails.length - 1; i >= 0; i--) {
      const e = state.emails[i]
      if (e?.to.includes(emailAddress)) return e
    }
    return null
  },
  lastMagicLinkFor(emailAddress: string): { url: string; token: string } | null {
    const email = this.lastEmailFor(emailAddress)
    if (!email) return null
    const body = `${email.html ?? ''} ${email.text ?? ''}`
    const match = body.match(/https?:\/\/[^\s"'<>]+/)
    if (!match) return null
    const url = match[0]
    try {
      const token = new URL(url).searchParams.get('token') ?? ''
      return { url, token }
    } catch {
      return { url, token: '' }
    }
  },
  reset() {
    state.emails = []
    state.calls = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
