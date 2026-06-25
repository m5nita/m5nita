/**
 * Validates a Brazilian CPF using the official check-digit algorithm.
 *
 * Formatting (dots, dash, spaces) is ignored. Returns false for anything that
 * is not 11 digits or whose verification digits do not match. CPFs made of a
 * single repeated digit (e.g. "00000000000") satisfy the check-digit math but
 * are not valid documents, so they are rejected explicitly.
 */
export function isValidCpf(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return false
  if (/^(\d)\1{10}$/.test(digits)) return false

  const checkDigit = (length: number): number => {
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i)
    }
    const remainder = (sum * 10) % 11
    return remainder === 10 ? 0 : remainder
  }

  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10])
}
