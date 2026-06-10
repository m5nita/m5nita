/**
 * Formats a centavos amount (BRL) as a localized currency string.
 * e.g. 18000 -> "R$ 180,00". Single source of truth for BRL formatting across
 * the API (emails, Telegram, OG cards) and the web app.
 */
export function formatBrl(centavos: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}
