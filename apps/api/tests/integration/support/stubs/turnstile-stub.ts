import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

export const VALID_TEST_TOKEN = 'turnstile-valid-test-token'

type Mode = 'always-valid' | 'always-invalid' | 'match-token'

const state = {
  mode: 'always-valid' as Mode,
  validTokens: new Set<string>([VALID_TEST_TOKEN]),
  calls: [] as StubCallLog[],
}

export const turnstileStub = {
  handlers: [
    http.post('https://challenges.cloudflare.com/turnstile/v0/siteverify', async ({ request }) => {
      const form = await request.formData()
      const token = String(form.get('response') ?? '')
      state.calls.push({
        provider: 'turnstile',
        timestamp: new Date().toISOString(),
        direction: 'outbound',
        summary: `siteverify(token=${token.slice(0, 12)}…)`,
      })
      const success =
        state.mode === 'always-valid'
          ? true
          : state.mode === 'always-invalid'
            ? false
            : state.validTokens.has(token)
      return HttpResponse.json({
        success,
        'error-codes': success ? [] : ['invalid-input-response'],
      })
    }),
  ],
  setMode(m: Mode) {
    state.mode = m
  },
  addValidToken(token: string) {
    state.validTokens.add(token)
  },
  reset() {
    state.mode = 'always-valid'
    state.validTokens = new Set([VALID_TEST_TOKEN])
    state.calls = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
