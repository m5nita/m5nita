import { redirect } from '@tanstack/react-router'
import { authClient } from './auth'

const PENDING_REDIRECT_KEY = 'm5nita_pending_redirect'

export function savePendingRedirect(url: string) {
  sessionStorage.setItem(PENDING_REDIRECT_KEY, url)
}

export function consumePendingRedirect(): string | null {
  const url = sessionStorage.getItem(PENDING_REDIRECT_KEY)
  if (url) sessionStorage.removeItem(PENDING_REDIRECT_KEY)
  return url
}

export async function redirectIfAuthenticated() {
  const session = await authClient.getSession()

  if (session.data?.user) {
    throw redirect({ to: '/' })
  }
}

export async function requireAuthGuard() {
  const session = await authClient.getSession()

  if (!session.data) {
    throw redirect({ to: '/login' })
  }

  if (!session.data.user) {
    await authClient.signOut().catch(() => {})
    throw redirect({ to: '/login' })
  }

  if (!session.data.user.name) {
    throw redirect({ to: '/complete-profile' })
  }

  return session.data
}
