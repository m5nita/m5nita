import { hc } from 'hono/client'
import type { AppType } from '@m5nita/api/src/index'

const client = hc<AppType>(import.meta.env.VITE_API_URL || '/', {
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
})

export const api = client.api

const API_BASE = import.meta.env.VITE_API_URL || ''

export function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}${path}`, { credentials: 'include', ...init })
}
