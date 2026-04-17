# Contract: Inbound Webhook — `POST /api/webhooks/infinitepay`

**Direction**: Inbound (InfinitePay → platform)
**Route file**: `apps/api/src/infrastructure/http/routes/webhooks.ts` (new handler added alongside MercadoPago handler)
**Auth**: NONE at the HTTP layer. The body is treated as untrusted; authenticity is established via active confirmation against InfinitePay's `payment_check` (see `contracts/infinitepay-payment-check.md`).

## Request

**Headers**: No required headers. Any signature/secret headers InfinitePay may send are read for logging only and never used to authorize state changes.

**Body**: JSON. Schema is intentionally loose because we do not trust it.

```typescript
type InboundWebhookBody = {
  // any of these may carry the order identifier:
  order_nsu?: string
  transaction_nsu?: string
  payment?: { order_nsu?: string; transaction_nsu?: string; status?: string }
  data?: { order_nsu?: string; transaction_nsu?: string }
  // ...arbitrary additional fields, all ignored
}
```

## Response

| Condition | Status | Body |
|---|---|---|
| Non-JSON body | `400` | `{ "error": "INVALID_BODY" }` |
| JSON body without any extractable identifier | `200` | `{ "received": true }` |
| Identifier present but no local payment row matches | `200` | `{ "received": true }` |
| Local payment matched, `payment_check` call failed (network or non-2xx) | `500` | `{ "error": "STATUS_LOOKUP_FAILED" }` |
| Local payment matched, `payment_check` returned `paid` | `200` | `{ "received": true }` (after running `handleCheckoutCompleted` idempotently) |
| Local payment matched, `payment_check` returned non-paid terminal status | `200` | `{ "received": true }` (after marking `payment.status = 'expired'`) |
| Local payment matched, `payment_check` returned pending/processing | `200` | `{ "received": true }` (no state change) |

## Idempotency

- Re-delivery of the same webhook for an already-`completed` payment: `handleCheckoutCompleted` short-circuits (existing behavior). Returns 200.
- Re-delivery for an `expired` payment that InfinitePay still reports as `expired`: status update is a no-op. Returns 200.

## Logging

- `info`: webhook received, extracted identifier, lookup-result status.
- `warn`: identifier-without-local-match, unknown-status response.
- `error`: `payment_check` failure (network or non-2xx), local DB write failure.

Never logged: full request body, full response body, the InfiniteTag handle.

## Out-of-band recovery

If InfinitePay's webhook delivery fails entirely, an operator can run the same `payment_check` lookup manually using the locally-stored `externalPaymentId` and update the payment via the same path. (Not implemented in this feature — documented as a future operational tool.)
