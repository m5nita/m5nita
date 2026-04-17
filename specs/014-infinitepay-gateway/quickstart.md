# Quickstart: InfinitePay Payment Gateway (developer / operator)

**Feature**: 014-infinitepay-gateway
**Audience**: Developers running the platform locally; operators flipping the gateway in production.

---

## 1. Local development (no InfinitePay account)

```bash
# .env (or shell)
PAYMENT_GATEWAY=infinitepay
# INFINITEPAY_HANDLE intentionally omitted

pnpm dev
```

**Expected behavior**: API starts. Logs show:

```text
[InfinitePay] No INFINITEPAY_HANDLE configured. Payment features will use mock mode.
```

Pool joins return mock checkout URLs that do not charge anyone.

---

## 2. Local development against real InfinitePay (sandbox)

```bash
# .env
PAYMENT_GATEWAY=infinitepay
INFINITEPAY_HANDLE=your_test_infinitetag       # without the leading "$"
ALLOWED_ORIGIN=http://localhost:5173
BETTER_AUTH_URL=http://localhost:3001

# expose the local API to the public internet so InfinitePay can reach the webhook
ngrok http 3001
# then set BETTER_AUTH_URL to the https URL ngrok prints

pnpm dev
```

**Expected behavior**:
- Joining a pool produces a real InfinitePay checkout URL.
- Completing the payment triggers a webhook to `<ngrok>/api/webhooks/infinitepay`.
- The webhook handler queries InfinitePay, marks the payment `completed`, and activates the pool member.

---

## 3. Production deployment

Required env vars:

```bash
PAYMENT_GATEWAY=infinitepay
INFINITEPAY_HANDLE=<operator's InfiniteTag>
NODE_ENV=production
ALLOWED_ORIGIN=https://<your-domain>
BETTER_AUTH_URL=https://<your-api-domain>
```

If `INFINITEPAY_HANDLE` is missing in production, the API process exits with:

```text
PAYMENT_GATEWAY=infinitepay but INFINITEPAY_HANDLE is missing
```

Configure InfinitePay's webhook URL in the InfinitePay dashboard to:

```text
https://<your-api-domain>/api/webhooks/infinitepay
```

Confirm in the InfinitePay merchant dashboard that PIX, credit card, and boleto are all enabled for the account; the platform does not toggle these per request.

---

## 4. Smoke test (after deploy)

1. Sign in as a test user.
2. Create or join a paid pool.
3. Complete payment via PIX (fastest method).
4. Within ~60s, confirm in the database:
   ```sql
   SELECT id, status, external_payment_id
   FROM payment
   WHERE user_id = '<test-user-id>'
   ORDER BY created_at DESC
   LIMIT 1;
   -- status should be 'completed', external_payment_id should look like "<slug>:<order_nsu>"
   ```
5. Confirm the user appears in `pool_member` for that pool.

---

## 5. Switching back to MercadoPago

```bash
PAYMENT_GATEWAY=mercadopago
# (other MP env vars must already be set)
```

Restart the API. In-flight InfinitePay payments remain queryable as historical records (FR-017). Their webhooks, if they arrive after the switch, will fail at the active-confirmation step (handle mismatch) and be ignored — no state corruption.

---

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Não foi possível iniciar o pagamento" shown to customer | InfinitePay API returned non-2xx for create-link | Check API logs for the error response body. Most common: invalid `INFINITEPAY_HANDLE`. |
| Webhook arrives but payment stays `pending` | `payment_check` returned a non-paid status | Inspect API logs at `info` level for the lookup result. Customer's payment may genuinely still be processing. |
| Webhook returns 500 repeatedly | InfinitePay's API is down or unreachable from the platform | Check egress / DNS. InfinitePay will retry. |
| `expired` payments appearing without customer action | InfinitePay reported the invoice as expired/failed | Expected. Customer can retry from the pool entry surface. |
