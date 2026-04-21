import type { Hono } from 'hono'
import { testOtpInbox } from '../../../src/lib/testHooks'
import type { AppEnv } from '../../../src/types/hono'
import { googleOAuthStub, resendStub } from './stubs'
import { VALID_TEST_TOKEN } from './stubs/turnstile-stub'

export type TestUser = {
  id: string
  phoneNumber?: string
  email?: string
  displayName: string | null
  sessionCookie: string
  fetch: (path: string, init?: RequestInit) => Promise<Response>
}

const DEFAULT_ORIGIN = () => process.env.ALLOWED_ORIGIN || 'http://localhost:5173'

function extractSessionCookie(response: Response): string {
  const setCookie = response.headers.getSetCookie
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie')?.split(', ') ?? [])
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie].filter(Boolean)
  const sessionCookies = cookies
    .filter((c) => /better-auth|session_token/i.test(String(c)))
    .map((c) => String(c).split(';')[0] ?? '')
    .filter((c) => c.length > 0)
  if (sessionCookies.length === 0) {
    throw new Error(
      `auth-helper: expected a session cookie in response, got headers: ${JSON.stringify(cookies)}`,
    )
  }
  return sessionCookies.join('; ')
}

function buildAuthedFetch(app: Hono<AppEnv>, sessionCookie: string) {
  return async (path: string, init: RequestInit = {}) => {
    const url = `http://localhost${path.startsWith('/') ? path : `/${path}`}`
    const headers = new Headers(init.headers)
    const existing = headers.get('cookie')
    headers.set('cookie', existing ? `${existing}; ${sessionCookie}` : sessionCookie)
    if (!headers.has('origin')) headers.set('origin', DEFAULT_ORIGIN())
    if (!headers.has('referer')) headers.set('referer', DEFAULT_ORIGIN())
    return app.fetch(new Request(url, { ...init, headers }))
  }
}

async function fetchUserId(
  app: Hono<AppEnv>,
  sessionCookie: string,
): Promise<{ id: string; name: string | null }> {
  const fetchAuthed = buildAuthedFetch(app, sessionCookie)
  const resp = await fetchAuthed('/api/users/me')
  if (!resp.ok) {
    throw new Error(`auth-helper: /api/users/me returned ${resp.status} after sign-in`)
  }
  const body = (await resp.json()) as { id: string; name: string | null }
  return body
}

async function sendOtpAndReadCode(app: Hono<AppEnv>, phoneNumber: string): Promise<string> {
  const url = 'http://localhost/api/auth/phone-number/send-otp'
  const response = await app.fetch(
    new Request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': VALID_TEST_TOKEN,
        origin: DEFAULT_ORIGIN(),
        referer: DEFAULT_ORIGIN(),
      },
      body: JSON.stringify({ phoneNumber }),
    }),
  )
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `auth-helper: send-otp returned ${response.status} for ${phoneNumber}: ${text.slice(0, 200)}`,
    )
  }
  const code = testOtpInbox.get(phoneNumber)
  if (!code) {
    throw new Error(
      `auth-helper: sendOTP did not populate testOtpInbox for ${phoneNumber}. ` +
        'Ensure NODE_ENV=test and that lib/auth.ts sendOTP stores into testHooks.',
    )
  }
  return code
}

export async function signInViaPhoneOtp(
  app: Hono<AppEnv>,
  opts: { phoneNumber: string; displayName?: string },
): Promise<TestUser> {
  const code = await sendOtpAndReadCode(app, opts.phoneNumber)

  const verifyResp = await app.fetch(
    new Request('http://localhost/api/auth/phone-number/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: DEFAULT_ORIGIN(),
        referer: DEFAULT_ORIGIN(),
      },
      body: JSON.stringify({ phoneNumber: opts.phoneNumber, code }),
    }),
  )
  if (!verifyResp.ok) {
    const text = await verifyResp.text()
    throw new Error(`auth-helper: verify-otp returned ${verifyResp.status}: ${text.slice(0, 200)}`)
  }

  const sessionCookie = extractSessionCookie(verifyResp)
  const me = await fetchUserId(app, sessionCookie)

  return {
    id: me.id,
    phoneNumber: opts.phoneNumber,
    displayName: me.name ?? opts.displayName ?? null,
    sessionCookie,
    fetch: buildAuthedFetch(app, sessionCookie),
  }
}

export async function signInViaMagicLink(
  app: Hono<AppEnv>,
  opts: { email: string; displayName?: string },
): Promise<TestUser> {
  process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 'test-resend-key'
  const callbackUrl = `${DEFAULT_ORIGIN()}/auth/callback`
  const requestResp = await app.fetch(
    new Request('http://localhost/api/auth/sign-in/magic-link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': VALID_TEST_TOKEN,
        origin: DEFAULT_ORIGIN(),
        referer: DEFAULT_ORIGIN(),
      },
      body: JSON.stringify({
        email: opts.email,
        name: opts.displayName ?? opts.email.split('@')[0] ?? 'Test User',
        callbackURL: callbackUrl,
      }),
    }),
  )
  if (!requestResp.ok) {
    const text = await requestResp.text()
    throw new Error(
      `auth-helper: sign-in/magic-link returned ${requestResp.status}: ${text.slice(0, 200)}`,
    )
  }

  const magicLink = resendStub.lastMagicLinkFor(opts.email)
  if (!magicLink) {
    throw new Error(`auth-helper: no magic-link email was sent to ${opts.email}`)
  }

  const verifyResp = await app.fetch(
    new Request(magicLink.url.replace(/^https?:\/\/[^/]+/, 'http://localhost'), {
      method: 'GET',
      redirect: 'manual',
      headers: {
        origin: DEFAULT_ORIGIN(),
        referer: DEFAULT_ORIGIN(),
      },
    }),
  )
  if (verifyResp.status >= 500) {
    const text = await verifyResp.text()
    throw new Error(
      `auth-helper: magic-link verify returned ${verifyResp.status}: ${text.slice(0, 200)}`,
    )
  }

  const sessionCookie = extractSessionCookie(verifyResp)
  const me = await fetchUserId(app, sessionCookie)

  return {
    id: me.id,
    email: opts.email,
    displayName: me.name ?? opts.displayName ?? null,
    sessionCookie,
    fetch: buildAuthedFetch(app, sessionCookie),
  }
}

export async function signInViaGoogle(
  app: Hono<AppEnv>,
  opts: { email: string; googleSub: string; displayName?: string },
): Promise<TestUser> {
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id-test'
  process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret-test'

  const code = googleOAuthStub.preAuthorize({
    email: opts.email,
    googleSub: opts.googleSub,
    name: opts.displayName,
  })

  const signInResp = await app.fetch(
    new Request('http://localhost/api/auth/sign-in/social', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Turnstile-Token': VALID_TEST_TOKEN,
        origin: DEFAULT_ORIGIN(),
        referer: DEFAULT_ORIGIN(),
      },
      body: JSON.stringify({
        provider: 'google',
        callbackURL: `${DEFAULT_ORIGIN()}/auth/callback`,
      }),
    }),
  )
  if (!signInResp.ok) {
    const text = await signInResp.text()
    throw new Error(
      `auth-helper: sign-in/social returned ${signInResp.status}: ${text.slice(0, 200)}`,
    )
  }
  const signInBody = (await signInResp.json()) as { url?: string }
  const authorizeUrl = signInBody.url
  if (!authorizeUrl) {
    throw new Error(`auth-helper: sign-in/social did not return an authorize URL`)
  }
  const state = new URL(authorizeUrl).searchParams.get('state')
  if (!state) throw new Error('auth-helper: authorize URL missing state')

  // Better Auth persists OAuth state in a cookie set on the sign-in response.
  // The callback MUST replay that cookie for the state check to pass.
  const stateCookies = signInResp.headers.getSetCookie
    ? signInResp.headers.getSetCookie()
    : (signInResp.headers.get('set-cookie')?.split(', ') ?? [])
  const cookieHeader = stateCookies
    .map((c) => String(c).split(';')[0] ?? '')
    .filter((c) => c.length > 0)
    .join('; ')

  const callbackResp = await app.fetch(
    new Request(
      `http://localhost/api/auth/callback/google?code=${code}&state=${encodeURIComponent(state)}`,
      {
        method: 'GET',
        redirect: 'manual',
        headers: {
          origin: DEFAULT_ORIGIN(),
          referer: DEFAULT_ORIGIN(),
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
      },
    ),
  )
  if (callbackResp.status >= 500) {
    const text = await callbackResp.text()
    throw new Error(
      `auth-helper: oauth callback returned ${callbackResp.status}: ${text.slice(0, 200)}`,
    )
  }

  const sessionCookie = extractSessionCookie(callbackResp)
  const me = await fetchUserId(app, sessionCookie)

  return {
    id: me.id,
    email: opts.email,
    displayName: me.name ?? opts.displayName ?? null,
    sessionCookie,
    fetch: buildAuthedFetch(app, sessionCookie),
  }
}
