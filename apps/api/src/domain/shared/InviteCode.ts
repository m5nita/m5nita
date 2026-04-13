export class InviteCode {
  private static readonly CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  private static readonly LENGTH = 8

  readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static generate(): InviteCode {
    let code = ''
    for (let i = 0; i < InviteCode.LENGTH; i++) {
      const index = Math.floor(Math.random() * InviteCode.CHARSET.length)
      code += InviteCode.CHARSET[index]
    }
    return new InviteCode(code)
  }

  static from(value: string): InviteCode {
    return new InviteCode(value)
  }
}
