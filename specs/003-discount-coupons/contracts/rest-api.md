# REST API Contract Changes

## Modified Endpoints

### POST /api/pools — Create pool (modified)

**Request body** (updated schema):
```json
{
  "name": "Bolão da Galera",
  "entryFee": 5000,
  "couponCode": "COPA2026"  // NEW: optional
}
```

**Validation** (Zod schema update):
- `couponCode`: `z.string().min(2).max(20).regex(/^[A-Z0-9]+$/).optional()`
- Input is normalized (trim + uppercase) before validation

**Response 201** (updated):
```json
{
  "pool": {
    "id": "uuid",
    "name": "Bolão da Galera",
    "entryFee": 5000,
    "inviteCode": "ABC12345",
    "platformFee": 0,
    "couponCode": "COPA2026",
    "originalPlatformFee": 250,
    "discountPercent": 100
  },
  "payment": {
    "id": "uuid",
    "checkoutUrl": "https://...",
    "amount": 5000
  }
}
```

New response fields:
- `pool.couponCode`: código do cupom aplicado (null se sem cupom)
- `pool.originalPlatformFee`: taxa sem desconto (para transparência)
- `pool.discountPercent`: percentual de desconto aplicado (0 se sem cupom)

**Error 400** — Cupom inválido:
```json
{
  "error": "INVALID_COUPON",
  "message": "Cupom inválido ou expirado"
}
```

**Error 400** — Cupom esgotado:
```json
{
  "error": "COUPON_EXHAUSTED",
  "message": "Cupom atingiu o limite de utilizações"
}
```

### POST /api/pools/validate-coupon — Validate coupon (new)

Endpoint para validação em tempo real no frontend (antes de submeter o form).

**Request body**:
```json
{
  "couponCode": "COPA2026",
  "entryFee": 5000
}
```

**Response 200** — Cupom válido:
```json
{
  "valid": true,
  "discountPercent": 100,
  "originalFee": 250,
  "discountedFee": 0
}
```

**Response 200** — Cupom inválido:
```json
{
  "valid": false,
  "reason": "expired"
}
```

Possible `reason` values: `"not_found"`, `"expired"`, `"exhausted"`, `"inactive"`

### GET /api/pools/invite/:inviteCode — Pool info (modified)

**Response** (updated — already returns `platformFee`, now reflects discount):
```json
{
  "id": "uuid",
  "name": "Bolão da Galera",
  "entryFee": 5000,
  "platformFee": 0,
  "originalPlatformFee": 250,
  "discountPercent": 100,
  "owner": { "name": "João" },
  "memberCount": 5,
  "prizeTotal": 25000,
  "isOpen": true
}
```

New fields: `originalPlatformFee`, `discountPercent`
