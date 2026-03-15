import { hc } from 'hono/client'
import type { AppType } from '@manita/api/src/index'

const client = hc<AppType>('/', {
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
})

export const api = client.api
