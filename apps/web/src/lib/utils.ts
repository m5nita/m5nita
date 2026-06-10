import { formatBrl } from '@m5nita/shared'

export function formatCurrency(cents: number): string {
  return formatBrl(cents)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
