# Contract: PaymentGateway Port (existing — unchanged)

**File**: `apps/api/src/application/ports/PaymentGateway.port.ts`
**Status for this feature**: NO CHANGES. Reference only.

The new InfinitePay adapter implements this existing port without modification.

```typescript
export interface CheckoutParams {
  userId: string
  poolId: string
  amount: number      // centavos (BRL)
  platformFee: number // centavos (BRL)
}

export interface CheckoutResult {
  payment: { id: string }
  checkoutUrl: string | null
}

export interface PaymentGateway {
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>
  isConfigured(): boolean
}
```

## Conformance requirements for `InfinitePayPaymentGateway`

- `createCheckoutSession` MUST return `payment.id` equal to the local row's UUID (the same value persisted in `payment.id`).
- `createCheckoutSession` MUST return a `checkoutUrl` that the customer's browser can navigate to without further auth — i.e., the URL returned by InfinitePay's create-link response.
- `isConfigured()` MUST return `true` only when `INFINITEPAY_HANDLE` is configured. When the adapter is constructed via the mock-fallback path, `MockPaymentGateway` is used instead — the InfinitePay class itself is never instantiated without config.

## Forbidden behaviors

- MUST NOT throw `any`-typed errors. Use named `Error` subclasses or descriptive `Error('...')` messages.
- MUST NOT log the handle, headers, or full response bodies.
- MUST NOT introduce new methods beyond those defined here. Refunds, payouts, and capture are out of scope.
