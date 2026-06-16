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

/**
 * Live match clock for display: `67'`, or `45+2'` during stoppage.
 * Returns null when there is no minute to show (so callers render nothing).
 */
export function formatMatchMinute(
  minute: number | null | undefined,
  injuryTime: number | null | undefined,
): string | null {
  if (minute == null) return null
  return injuryTime && injuryTime > 0 ? `${minute}+${injuryTime}'` : `${minute}'`
}
