# Payment API Contracts

**Feature**: 012-stripe-to-mercadopago
**Date**: 2026-04-13

## Existing Endpoints (behavior changes)

### POST /api/pools

**Change**: None at API level. Response still includes `payment.checkoutUrl`. Internally creates MP Preference instead of Stripe Session.

**Response** (unchanged):
```json
{
  "pool": { "id": "uuid", "..." },
  "payment": {
    "id": "uuid",
    "checkoutUrl": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=xxx"
  }
}
```

### POST /api/pools/:poolId/join

**Change**: Same as above. `checkoutUrl` now points to Mercado Pago.

### DELETE /api/pools/:poolId/members/:memberId

**Change**: No longer processes refund. Just removes the member.

**Before**:
```json
{
  "refund": { "id": "payment-id", "amount": 2000, "status": "pending" }
}
```

**After**:
```json
{
  "removed": true
}
```

### POST /api/pools/:poolId/cancel

**Change**: No longer processes refunds. Just cancels pool and removes members.

**Before**:
```json
{
  "refunds": [
    { "userId": "user-1", "amount": 2000, "status": "pending" },
    { "userId": "user-2", "amount": 2000, "status": "pending" }
  ]
}
```

**After**:
```json
{
  "cancelled": true
}
```

## New Endpoint

### POST /api/webhooks/mercadopago

**Replaces**: `POST /api/webhooks/stripe`

**Request** (from Mercado Pago):
```json
{
  "action": "payment.created",
  "api_version": "v1",
  "data": { "id": "123456789" },
  "date_created": "2026-04-13T10:00:00Z",
  "id": "event-id",
  "live_mode": true,
  "type": "payment",
  "user_id": "mp-user-id"
}
```

**Headers**:
- `x-signature`: `ts=1234567890,v1=abc123...` (HMAC signature for verification)
- `x-request-id`: Request ID used in signature computation

**Processing**:
1. Verify `x-signature` header using webhook secret
2. If `type === "payment"`, fetch `GET /v1/payments/{data.id}` from MP API
3. If payment status is `approved`, look up internal payment by `external_reference`
4. Update payment status to `completed`, create pool member, activate pool if pending
5. Return `200 OK`

**Response**: `{ "received": true }`

## Removed Endpoint

### POST /api/webhooks/stripe

Deleted. Replaced by `/api/webhooks/mercadopago`.

## PaymentGateway Port (internal contract)

```typescript
interface PaymentGateway {
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  isConfigured(): boolean
  // refund() REMOVED
}
```
