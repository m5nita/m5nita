# Quickstart: Stripe to Mercado Pago Migration

**Feature**: 012-stripe-to-mercadopago
**Date**: 2026-04-13

## Prerequisites

- Mercado Pago account with Checkout Pro enabled
- Access Token from MP developer dashboard (Credentials section)
- Webhook secret from MP developer dashboard (Webhooks section)

## Environment Variables

Replace Stripe vars with Mercado Pago vars in `apps/api/.env`:

```bash
# Remove these:
# STRIPE_SECRET_KEY=sk_test_xxx
# STRIPE_WEBHOOK_SECRET=whsec_xxx

# Add these:
MERCADOPAGO_ACCESS_TOKEN=TEST-xxx  # or APP_USR-xxx for production
MERCADOPAGO_WEBHOOK_SECRET=xxx     # from MP dashboard Webhooks config
```

## Development (Mock Mode)

If `MERCADOPAGO_ACCESS_TOKEN` is not set or is the placeholder value, the system falls back to `MockPaymentGateway` which auto-completes payments without external calls. Same behavior as current Stripe mock mode.

## Testing Webhooks Locally

1. Use MP's test access token (`TEST-xxx`)
2. For local webhook delivery, use a tunnel (e.g., ngrok) pointing to your API port
3. Configure the tunnel URL as `notification_url` in the preference or in MP dashboard

## Key Differences from Stripe

| Aspect | Stripe | Mercado Pago |
|--------|--------|--------------|
| Checkout object | Session | Preference |
| Checkout URL | `session.url` | `preference.init_point` |
| Webhook payload | Full event object | Lightweight `{ type, data: { id } }` — must fetch payment details |
| Webhook verification | `stripe.webhooks.constructEvent()` | Manual HMAC verification of `x-signature` header |
| Amount format | Centavos (integer) | Reais (decimal) — convert from centavos when creating preference |
| Redirect URLs | `success_url`, `cancel_url` | `back_urls.success`, `back_urls.failure`, `back_urls.pending` |
| Env vars | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` |
