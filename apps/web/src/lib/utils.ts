export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function calculatePrize(entryFee: number, memberCount: number, discountPercent = 0): number {
  const effectiveRate = 0.05 * (1 - discountPercent / 100)
  return Math.floor(entryFee * memberCount * (1 - effectiveRate))
}

export function calculatePlatformFee(amount: number): number {
  return Math.floor(amount * 0.05)
}

export function calculateDiscountedFee(amount: number, discountPercent: number): number {
  const effectiveRate = 0.05 * (1 - discountPercent / 100)
  return Math.floor(amount * effectiveRate)
}
