# Contract: InfinitePay — Create Checkout Link (outbound)

**Direction**: Outbound (platform → InfinitePay)
**Endpoint**: `POST https://api.infinitepay.io/invoices/public/checkout/links`
**Caller**: `InfinitePayPaymentGateway.createCheckoutSession()`

## Request

**Headers**:
- `Content-Type: application/json`
- `Accept: application/json`

**Body** (TypeScript shape; sent as JSON):

```typescript
type CreateLinkRequest = {
  handle: string                  // operator's InfiniteTag, no leading "$"
  redirect_url?: string           // platform's payment-success page (absolute https URL)
  webhook_url?: string            // platform's POST /api/webhooks/infinitepay (absolute https URL)
  order_nsu?: string              // local payment.id (UUID); echoed back in webhooks
  customer?: {
    name?: string
    email?: string
    phone_number?: string         // E.164 if known; omit otherwise
  }
  items: [
    {
      description: string         // "Entrada no Bolão"
      quantity: number             // integer, >= 1
      price: number                // centavos (BRL)
    }
  ]
}
```

## Response (success: HTTP 2xx)

```typescript
type CreateLinkResponse = {
  url: string                     // customer-facing checkout URL
  slug: string                    // invoice slug; needed by payment_check
  order_nsu: string               // echo of the order_nsu sent
  // (other fields ignored)
}
```

## Adapter behavior

1. Insert local `payment` row (status `'pending'`, `externalPaymentId` null).
2. POST request body above using native `fetch`.
3. On non-2xx or network error: delete the just-inserted local row; throw an `Error` with a generic message. Logged at `error`.
4. On 2xx with valid body: persist `externalPaymentId = "${slug}:${order_nsu}"`. Return `{ payment: { id }, checkoutUrl: response.url }`.

## Error response handling

Any non-2xx is treated as failure. The adapter does NOT attempt to map InfinitePay-specific error codes — the customer always sees a single generic actionable error. Operators inspect logs.

## Validation (Zod schema applied at boundary)

```typescript
const CreateLinkResponseSchema = z.object({
  url: z.string().url(),
  slug: z.string().min(1),
  order_nsu: z.string().min(1),
}).passthrough()
```

A response that fails this schema is treated identically to a non-2xx response.
