import type { CaptchaVerifier } from '../application/ports/CaptchaVerifier.port'
import { CloudflareTurnstileVerifier } from '../infrastructure/external/CloudflareTurnstileVerifier'

let _verifier: CaptchaVerifier | null = null

export function getCaptchaVerifier(): CaptchaVerifier {
  if (_verifier) return _verifier
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    throw new Error('TURNSTILE_SECRET_KEY is not set')
  }
  _verifier = new CloudflareTurnstileVerifier(secret)
  return _verifier
}
