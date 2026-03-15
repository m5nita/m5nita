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

export function calculatePrize(entryFee: number, memberCount: number): number {
  return Math.floor(entryFee * memberCount * 0.95)
}

export function calculatePlatformFee(amount: number): number {
  return Math.floor(amount * 0.05)
}
