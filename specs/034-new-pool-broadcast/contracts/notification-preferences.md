# Contract: `/api/notification-preferences`

Backs User Story 2. New router
`apps/api/src/infrastructure/http/routes/notificationPreferences.ts`, mounted with
`app.route('/api', notificationPreferencesRoutes)` in `apps/api/src/app.ts`.
`requireAuth` applies to `/*` in the router, as in `routes/push.ts`.

Both endpoints are always "me" — the handler reads `c.get('user').id` and there is
no user id in the path.

---

## `GET /api/notification-preferences`

Returns the catalog in display order, each entry resolved against the caller's
overrides.

- **Auth**: required. Unauthenticated → `401`.
- **Query/body**: none.
- **Delegation**: `getContainer().getNotificationPreferencesUseCase.execute({ userId })`.

### Response `200 application/json` — `NotificationPreferencesResponse`

```jsonc
{
  "types": [
    {
      "code": "new_pool",
      "label": "Novos bolões",
      "description": "Avisos quando alguém cria um bolão novo e libera a entrada.",
      "enabled": true,          // resolved: override if any, else catalog default
      "optOutable": true        // false → render locked, no switch
    },
    {
      "code": "prediction_reminder",
      "label": "Lembretes de palpite",
      "description": "Aviso quando um jogo do seu bolão está perto de começar e falta palpite.",
      "enabled": false,
      "optOutable": true
    },
    {
      "code": "match_points",
      "label": "Pontos por jogo",
      "description": "Quantos pontos você fez ao final de cada jogo e sua posição no bolão.",
      "enabled": true,
      "optOutable": true
    },
    {
      "code": "pool_result",
      "label": "Prêmio disponível",
      "description": "Aviso de vitória e prêmio disponível para saque.",
      "enabled": true,          // always true for a non-opt-outable type
      "optOutable": false
    }
  ]
}
```

### JSON Schema (response)

```json
{
  "type": "object",
  "required": ["types"],
  "additionalProperties": false,
  "properties": {
    "types": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["code", "label", "description", "enabled", "optOutable"],
        "additionalProperties": false,
        "properties": {
          "code": { "type": "string" },
          "label": { "type": "string" },
          "description": { "type": "string" },
          "enabled": { "type": "boolean" },
          "optOutable": { "type": "boolean" }
        }
      }
    }
  }
}
```

### Guarantees

- Ordered by the catalog's `sort_order`, ascending.
- A user with no stored preferences gets every `enabled` from the catalog default —
  never an empty list, never a `404`.
- `enabled` is `true` for every `optOutable: false` entry, regardless of what is
  stored (domain invariant, not a database constraint).
- The response is derived from the catalog, so a newly seeded type appears here
  with no code change (SC-005).

---

## `PATCH /api/notification-preferences`

Changes exactly one type.

- **Auth**: required. Unauthenticated → `401`.
- **Delegation**: `getContainer().updateNotificationPreferencesUseCase.execute({ userId, code, enabled })`.

### Request body

```jsonc
{ "code": "new_pool", "enabled": false }
```

Validated by `updateNotificationPreferenceSchema` in `@m5nita/shared`:

```ts
z.object({
  code: z.string().min(1).max(64),
  enabled: z.boolean(),
})
```

The code is checked against the **catalog** (not a hardcoded list) inside the use
case, so a seeded type is immediately patchable.

### Response `200 application/json`

The full, freshly resolved list — identical shape to `GET`, so the client replaces
its state with one round trip instead of guessing.

### Errors

| Status | `error` | When |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Body missing, malformed, or `enabled` not a boolean. |
| `404` | `UNKNOWN_NOTIFICATION_TYPE` | `code` is not in the catalog. |
| `409` | `NOTIFICATION_TYPE_LOCKED` | `code` exists but `optOutable` is `false` and `enabled` is `false`. |
| `401` | — | No session. |

Sending `enabled: true` for a locked type is accepted as a no-op (it is already
the effective state) rather than rejected, so an idempotent client retry cannot
fail.

### Behaviour

- Upserts on `(user_id, type_code)` — toggling repeatedly never creates a second
  row and always refreshes `updated_at`.
- Setting a value equal to the catalog default still writes a row. This is
  deliberate: it records that the user made a choice, so a future change to the
  default does not silently flip them.
- Changing one type never touches another (US2 scenario 7).
