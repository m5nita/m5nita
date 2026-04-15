export class MissingCaptchaTokenError extends Error {
  constructor() {
    super('captcha_required')
    this.name = 'MissingCaptchaTokenError'
  }
}

export class InvalidCaptchaTokenError extends Error {
  constructor() {
    super('captcha_invalid')
    this.name = 'InvalidCaptchaTokenError'
  }
}

export class TurnstileToken {
  private static readonly MAX_LENGTH = 2048

  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static fromHeader(raw: string | undefined | null): TurnstileToken {
    if (!raw || raw.trim() === '') {
      throw new MissingCaptchaTokenError()
    }
    if (raw.length > TurnstileToken.MAX_LENGTH) {
      throw new InvalidCaptchaTokenError()
    }
    return new TurnstileToken(raw)
  }
}
