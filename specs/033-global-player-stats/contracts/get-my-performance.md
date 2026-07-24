# Contract: GET /api/users/me/performance

The single endpoint backing "Meu desempenho" (US1) and the home summary card (US2).

- **Method / Path**: `GET /api/users/me/performance`
- **Router**: `apps/api/src/infrastructure/http/routes/users.ts` (mounted at `/api`;
  `requireAuth` already applies to `/*` in that router).
- **Auth**: required. The handler reads `c.get('user').id`. Unauthenticated → `401`.
- **Query/body**: none (always "me").
- **Delegation**: `getContainer().getMyPerformanceUseCase.execute({ userId })`.

## Response `200 application/json` — `MyPerformanceResponse`

```jsonc
{
  "participei": 17,
  "vitorias": 6,
  "derrotas": 9,
  "emAndamento": 2,
  "aproveitamento": 0.4,              // ratio 0..1, or null when no decided pools
  "gasteiCentavos": 25500,
  "premiosConquistadosCentavos": 61200,
  "aSacarCentavos": 9000,
  "saldoCentavos": 35700,             // SIGNED: may be negative (prejuízo)
  "maiorPremioCentavos": 22000,       // or null if never won
  "evolucao": [
    { "poolId": "…", "settledAt": "2026-05-02T20:00:00.000Z", "saldoCentavos": -1500 },
    { "poolId": "…", "settledAt": "2026-05-20T20:00:00.000Z", "saldoCentavos": 6000 }
    // … one cumulative point per pool, chronological
  ]
}
```

### JSON Schema (response)

```json
{
  "type": "object",
  "required": ["participei","vitorias","derrotas","emAndamento","aproveitamento",
    "gasteiCentavos","premiosConquistadosCentavos","aSacarCentavos","saldoCentavos",
    "maiorPremioCentavos","evolucao"],
  "properties": {
    "participei": { "type": "integer", "minimum": 0 },
    "vitorias": { "type": "integer", "minimum": 0 },
    "derrotas": { "type": "integer", "minimum": 0 },
    "emAndamento": { "type": "integer", "minimum": 0 },
    "aproveitamento": { "type": ["number","null"], "minimum": 0, "maximum": 1 },
    "gasteiCentavos": { "type": "integer", "minimum": 0 },
    "premiosConquistadosCentavos": { "type": "integer", "minimum": 0 },
    "aSacarCentavos": { "type": "integer", "minimum": 0 },
    "saldoCentavos": { "type": "integer" },
    "maiorPremioCentavos": { "type": ["integer","null"], "minimum": 0 },
    "evolucao": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["poolId","settledAt","saldoCentavos"],
        "properties": {
          "poolId": { "type": "string" },
          "settledAt": { "type": ["string","null"], "format": "date-time" },
          "saldoCentavos": { "type": "integer" }
        }
      }
    }
  }
}
```

## Empty state (new user, no pools)

```json
{
  "participei": 0, "vitorias": 0, "derrotas": 0, "emAndamento": 0,
  "aproveitamento": null,
  "gasteiCentavos": 0, "premiosConquistadosCentavos": 0, "aSacarCentavos": 0,
  "saldoCentavos": 0, "maiorPremioCentavos": null, "evolucao": []
}
```

The frontend renders the inviting empty state (FR-015) when `participei === 0`.

## Errors

| Status | When | Body |
|--------|------|------|
| `401` | no valid session | standard auth error (from `requireAuth`) |

No `404`/`400` paths — the endpoint is always the authenticated user and takes no
input.

## Invariants the contract test asserts

- `vitorias + derrotas === (count of the user's closed non-cancelled pools)`.
- `saldoCentavos === premiosConquistadosCentavos − gasteiCentavos`.
- `aSacarCentavos ≤ premiosConquistadosCentavos`.
- `aproveitamento === null` **iff** `vitorias + derrotas === 0`.
- `maiorPremioCentavos === null` **iff** `premiosConquistadosCentavos === 0`.
- Response reconciles with per-pool truth: for the seeded user, the sum over their
  pools of (prize entitlement from `GetPrizeInfoUseCase` − entry paid) equals
  `saldoCentavos` (SC-003).

## Performance budget (Principle IV)

- ≤ 3 DB round-trips regardless of pool count (no per-pool loop).
- Endpoint **p95 < 200 ms**; a benchmark/query-count test guards against a
  regression to O(pools) queries.
