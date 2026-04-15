import type { TurnstileToken } from '../../domain/shared/TurnstileToken'

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'duplicate' | 'unavailable' }

export interface CaptchaVerifier {
  verify(token: TurnstileToken, remoteIp: string | null): Promise<CaptchaResult>
}
