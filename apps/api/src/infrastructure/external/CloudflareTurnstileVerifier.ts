import type { CaptchaResult, CaptchaVerifier } from '../../application/ports/CaptchaVerifier.port'
import type { TurnstileToken } from '../../domain/shared/TurnstileToken'

interface SiteVerifyResponse {
  success: boolean
  'error-codes'?: string[]
}

const DEFAULT_ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const DEFAULT_TIMEOUT_MS = 3000

export interface CloudflareVerifierOptions {
  endpoint?: string
  timeoutMs?: number
  fetchFn?: typeof fetch
}

export class CloudflareTurnstileVerifier implements CaptchaVerifier {
  private readonly endpoint: string
  private readonly timeoutMs: number
  private readonly fetchFn: typeof fetch

  constructor(
    private readonly secretKey: string,
    opts: CloudflareVerifierOptions = {},
  ) {
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchFn = opts.fetchFn ?? fetch
  }

  async verify(token: TurnstileToken, remoteIp: string | null): Promise<CaptchaResult> {
    const body = new URLSearchParams({ secret: this.secretKey, response: token.value })
    if (remoteIp) body.set('remoteip', remoteIp)
    const res = await this.callSiteverify(body)
    if (!res) return { ok: false, reason: 'unavailable' }
    if (res.success) return { ok: true }
    return { ok: false, reason: mapErrorCodes(res['error-codes']) }
  }

  private async callSiteverify(body: URLSearchParams): Promise<SiteVerifyResponse | null> {
    try {
      const res = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      })
      if (!res.ok) return null
      return (await res.json()) as SiteVerifyResponse
    } catch {
      return null
    }
  }
}

function mapErrorCodes(codes: string[] | undefined): 'invalid' | 'expired' | 'duplicate' {
  if (!codes || codes.length === 0) return 'invalid'
  if (codes.includes('timeout-or-duplicate')) return 'expired'
  return 'invalid'
}
