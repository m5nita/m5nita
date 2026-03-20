export function isAdmin(telegramUserId: number): boolean {
  const adminIds = process.env.ADMIN_USER_IDS ?? ''
  return adminIds
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .includes(String(telegramUserId))
}
