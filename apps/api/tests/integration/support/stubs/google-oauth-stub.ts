import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function makeIdToken(entry: PreAuthorized): string {
  const header = { alg: 'none', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_CLIENT_ID ?? 'google-client-id-test',
    sub: entry.googleSub,
    email: entry.email,
    email_verified: entry.emailVerified,
    name: entry.name,
    iat: now,
    exp: now + 3600,
  }
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}.`
}

type PreAuthorized = {
  code: string
  email: string
  googleSub: string
  emailVerified: boolean
  name: string
}

const state = {
  byCode: new Map<string, PreAuthorized>(),
  bySub: new Map<string, PreAuthorized>(),
  calls: [] as StubCallLog[],
  seq: 0,
}

function record(summary: string, payload?: unknown) {
  state.calls.push({
    provider: 'google-oauth',
    timestamp: new Date().toISOString(),
    direction: 'outbound',
    summary,
    payload,
  })
}

export const googleOAuthStub = {
  handlers: [
    http.post('https://oauth2.googleapis.com/token', async ({ request }) => {
      const form = await request.formData()
      const code = String(form.get('code') ?? '')
      const entry = state.byCode.get(code)
      record(`token(code=${code.slice(0, 12)}…)`, { present: !!entry })
      if (!entry) {
        return HttpResponse.json({ error: 'invalid_grant' }, { status: 400 })
      }
      return HttpResponse.json({
        access_token: `access-${entry.googleSub}`,
        id_token: makeIdToken(entry),
        token_type: 'Bearer',
        expires_in: 3600,
      })
    }),
    http.get('https://openidconnect.googleapis.com/v1/userinfo', ({ request }) => {
      const auth = request.headers.get('Authorization') ?? ''
      const sub = auth.replace('Bearer access-', '')
      const entry = state.bySub.get(sub)
      record(`userinfo(sub=${sub})`, { present: !!entry })
      if (!entry) return HttpResponse.json({ error: 'invalid_token' }, { status: 401 })
      return HttpResponse.json({
        sub: entry.googleSub,
        email: entry.email,
        email_verified: entry.emailVerified,
        name: entry.name,
        picture: null,
      })
    }),
    http.get('https://www.googleapis.com/oauth2/v3/userinfo', ({ request }) => {
      const auth = request.headers.get('Authorization') ?? ''
      const sub = auth.replace('Bearer access-', '')
      const entry = state.bySub.get(sub)
      record(`userinfo-v3(sub=${sub})`, { present: !!entry })
      if (!entry) return HttpResponse.json({ error: 'invalid_token' }, { status: 401 })
      return HttpResponse.json({
        sub: entry.googleSub,
        email: entry.email,
        email_verified: entry.emailVerified,
        name: entry.name,
        picture: null,
      })
    }),
  ],
  preAuthorize(opts: {
    email: string
    googleSub: string
    emailVerified?: boolean
    name?: string
  }): string {
    state.seq += 1
    const code = `google-stub-code-${state.seq}`
    const entry: PreAuthorized = {
      code,
      email: opts.email,
      googleSub: opts.googleSub,
      emailVerified: opts.emailVerified ?? true,
      name: opts.name ?? opts.email.split('@')[0] ?? 'Test User',
    }
    state.byCode.set(code, entry)
    state.bySub.set(opts.googleSub, entry)
    return code
  },
  reset() {
    state.byCode = new Map()
    state.bySub = new Map()
    state.calls = []
    state.seq = 0
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
