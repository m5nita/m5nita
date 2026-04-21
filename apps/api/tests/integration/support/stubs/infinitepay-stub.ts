import { HttpResponse, http } from 'msw'
import type { StubCallLog } from './types'

type PaymentStatus = 'paid' | 'rejected' | 'expired' | 'pending'

type CheckoutFailure = { status: number; body: string }

const state = {
  statusByOrder: new Map<string, PaymentStatus>(),
  checkoutsCreated: [] as Array<{ orderNsu: string; amount: number }>,
  calls: [] as StubCallLog[],
  pendingCheckoutFailures: [] as CheckoutFailure[],
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

      const failure = state.pendingCheckoutFailures.shift()
      if (failure) {
        record(`POST /checkout/links(order=${orderNsu}) → ${failure.status}`)
        return new HttpResponse(failure.body, {
          status: failure.status,
          headers: { 'Content-Type': 'text/html' },
        })
      }

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
  /**
   * Queue a failure response for the next N calls to `/checkout/links`. The
   * InfinitePay adapter retries up to 3x with exponential backoff on 502 —
   * push 3 failures to force the whole retry loop to exhaust.
   */
  queueCheckoutFailure(opts: { status?: number; body?: string; count?: number } = {}) {
    const status = opts.status ?? 502
    const body =
      opts.body ?? '<html><body><h1>Error: Server Error</h1><h2>Temporary error.</h2></body></html>'
    const count = opts.count ?? 3
    for (let i = 0; i < count; i++) state.pendingCheckoutFailures.push({ status, body })
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
    state.pendingCheckoutFailures = []
  },
  callLog(): StubCallLog[] {
    return [...state.calls]
  },
}
