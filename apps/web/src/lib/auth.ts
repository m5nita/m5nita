import { createAuthClient } from 'better-auth/react'
import { phoneNumberClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || '',
  basePath: '/api/auth',
  plugins: [phoneNumberClient()],
})

export const { useSession, signOut } = authClient
