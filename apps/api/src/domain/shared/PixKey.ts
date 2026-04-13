const VALID_TYPES = ['cpf', 'email', 'phone', 'random'] as const
type PixKeyType = (typeof VALID_TYPES)[number]

export class PixKey {
  readonly type: PixKeyType
  readonly value: string

  private constructor(type: PixKeyType, value: string) {
    this.type = type
    this.value = value
  }

  static create(type: string, value: string): PixKey {
    if (!VALID_TYPES.includes(type as PixKeyType)) {
      throw new Error(`Invalid PIX key type: ${type}`)
    }
    const t = type as PixKeyType
    if (t === 'cpf' && !/^\d{11}$/.test(value)) {
      throw new Error('CPF must be exactly 11 digits')
    }
    if (t === 'email' && (!value.includes('@') || !value.includes('.'))) {
      throw new Error('Email must contain @ and .')
    }
    if (t === 'phone' && !/^\+55\d{10,11}$/.test(value)) {
      throw new Error('Phone must start with +55 followed by 10-11 digits')
    }
    if (t === 'random' && (value.length !== 36 || !value.includes('-'))) {
      throw new Error('Random key must be UUID format (36 chars with hyphens)')
    }
    return new PixKey(t, value)
  }

  masked(): string {
    if (this.value.length <= 4) return this.value
    return '*'.repeat(this.value.length - 4) + this.value.slice(-4)
  }
}
