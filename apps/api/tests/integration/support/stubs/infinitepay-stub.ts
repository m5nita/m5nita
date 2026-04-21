import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

type PaymentStatus = 'paid' | 'rejected' | 'expired' | 'pending'

const state = {
  statusByOrder: new Map<string, PaymentStatus>(),
  checkoutsCreated: [] as Array<{ orderNsu: string; amount: number }>,
  calls: [] as StubCallLog[],
}

function record(summary: string, payload?: unknown) {
  state.calls.push({
    provider: 'infinitepay',
    timestamp: new Date().toISOString(),
    direction: 'outbound',
    summary,
    payload,
  })
}

export const infinitePayStub = {
  handlers: [
    http.post('https://api.infinitepay.io/invoices/public/checkout/links', async ({ request }) => {
      const body = (await request.json()) as {
        order_nsu?: string
        items?: Array<{ price?: number }>
      }
      const orderNsu = String(body.order_nsu ?? '')
      const amount = body.items?.[0]?.price ?? 0
      state.checkoutsCreated.push({ orderNsu, amount })
      state.statusByOrder.set(orderNsu, 'pending')
      record(`POST /checkout/links(order=${orderNsu}, amount=${amount})`)
      return HttpResponse.json({
        url: `https://infinitepay.test/pay/${orderNsu}`,
      })
    }),
    http.post(
      'https://api.infinitepay.io/invoices/public/checkout/payment_check',
      async ({ request }) => {
        const body = (await request.json()) as { order_nsu?: string }
        const orderNsu = String(body.order_nsu ?? '')
        const status = state.statusByOrder.get(orderNsu) ?? 'pending'
        record(`POST /payment_check(order=${orderNsu})`, { status })
        return HttpResponse.json({
          success: true,
          paid: status === 'paid',
          payment: { status },
        })
      },
    ),
  ],
  setStatus(orderNsu: string, status: PaymentStatus) {
    state.statusByOrder.set(orderNsu, status)
  },
  checkouts(): Array<{ orderNsu: string; amount: number }> {
    return [...state.checkoutsCreated]
  },
  lastCheckout(): { orderNsu: string; amount: number } | null {
    return state.checkoutsCreated.at(-1) ?? null
  },
  reset() {
    state.statusByOrder = new Map()
    state.checkoutsCreated = []
    state.calls = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
