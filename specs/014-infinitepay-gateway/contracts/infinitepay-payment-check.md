# Contract: InfinitePay — Payment Check (outbound)

**Direction**: Outbound (platform → InfinitePay)
**Endpoint**: `POST https://api.infinitepay.io/invoices/public/checkout/payment_check`
**Caller**: webhook route after extracting the reference from an inbound notification.

## Request

**Headers**:
- `Content-Type: application/json`
- `Accept: application/json`

**Body**:

```typescript
type PaymentCheckRequest = {
  handle: string            // operator's InfiniteTag (no leading "$")
  order_nsu: string         // local payment.id (UUID) — always required
  slug?: string             // invoice slug from webhook body or redirect URL
  transaction_nsu?: string  // transaction identifier from webhook body or redirect URL
}
```

> **Field-name convention gotcha**: InfinitePay uses `slug` here in the `payment_check` request body, **but uses `invoice_slug` in the webhook payload and in the redirect URL query parameters**. The two names refer to the same value. When forwarding to `payment_check`, rename `invoice_slug` → `slug`.
>
> Verified empirically with curl against the production API: sending `invoice_slug` returns `{"success":false}` even for a genuinely paid invoice; sending `slug` returns `{"success":true,"paid":true,...}`.

## Response (success: HTTP 2xx)

```typescript
type PaymentCheckResponse = {
  success: boolean            // false when the (handle, order_nsu, slug) triple doesn't resolve
  paid?: boolean              // present with `true` when the invoice was paid
  amount?: number             // centavos; requested amount
  paid_amount?: number        // centavos; actually paid amount (may differ due to fees/installments)
  installments?: number
  capture_method?: string     // "credit_card" | (others)
  payment?: {
    status?: string           // legacy/alternate shape: "paid" | "pending" | "rejected" | etc.
  }
}
```

Observed real-world responses:

- Paid: `{"success":true,"paid":true,"amount":500,"paid_amount":516,"installments":1,"capture_method":"credit_card"}`
- Not paid / not found / missing fields: `{"success":false}`

The authoritative status mapping is:
1. If `response.payment.status` is present, use it directly.
2. Else if `response.paid === true`, treat as `paid`.
3. Else (`success: false` or unrecognized shape), treat as `unknown` — no state change.

## Webhook-route behavior (call site)

1. Receive untrusted webhook body. If non-JSON, return HTTP 400.
2. Extract candidate identifier from body (any of: `body.order_nsu`, `body.payment.order_nsu`, `body.data.order_nsu`).
3. Look up local `payment` row by `externalPaymentId LIKE '${slug}:${order_nsu}'` for the parsed identifier. If none found: return HTTP 200 (idempotent silence; reference may belong to another tenant or be forged).
4. POST `PaymentCheckRequest` using native `fetch`.
5. On non-2xx or network error: log at `error`; return HTTP 500 (so InfinitePay retries the webhook).
6. On 2xx: validate via Zod; map status using the table in `data-model.md`; invoke `handleCheckoutCompleted` (idempotent) or update `payment.status` to `'expired'` accordingly. Return HTTP 200.

## Validation (Zod schema applied at boundary)

```typescript
const PaymentCheckResponseSchema = z.object({
  success: z.boolean().optional(),
  paid: z.boolean().optional(),
  payment: z.object({
    status: z.string().min(1),
  }).passthrough().optional(),
}).passthrough()
```

A response that fails this schema is treated as `unknown` status (no state change, logged at `warn`, HTTP 200 returned).

## Why this is the authentication mechanism

The webhook body is treated as untrusted. The `payment_check` request includes the operator's `handle` and the local `slug`+`order_nsu` (which were minted by InfinitePay during create-link and stored locally). InfinitePay will only return `paid` for an invoice that genuinely exists in the operator's account and was genuinely paid. A forged webhook with a fabricated `order_nsu` will:
- Either map to no local payment (rejected at step 3), OR
- Be checked against InfinitePay and return non-paid (no state change).

There is no path by which a forged webhook can transition a `pending` payment to `completed`.
