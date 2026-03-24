# API Contracts: 005-winner-prize-withdrawal

**Date**: 2026-03-22

## POST /api/pools/:poolId/close

Finalize a pool (owner only). Changes status to `closed`.

**Auth**: Required (pool owner only)

**Request**: No body required.

**Response 200**:
```json
{
  "id": "uuid",
  "name": "Bolao da Copa",
  "status": "closed",
  "updatedAt": "2026-07-14T00:00:00Z"
}
```

**Response 400** (matches not finished):
```json
{
  "error": "MATCHES_NOT_FINISHED",
  "message": "Ainda existem partidas pendentes. Todas as partidas devem ter resultado antes de finalizar."
}
```

**Response 400** (pool not active):
```json
{
  "error": "POOL_NOT_ACTIVE",
  "message": "Apenas boloes ativos podem ser finalizados."
}
```

**Response 403** (not owner):
```json
{
  "error": "NOT_POOL_OWNER",
  "message": "Apenas o dono do bolao pode finaliza-lo."
}
```

---

## GET /api/pools/:poolId/prize

Get prize information for a finalized pool, including whether the current user is a winner and can request withdrawal.

**Auth**: Required (pool member)

**Response 200**:
```json
{
  "prizeTotal": 14250,
  "winnerCount": 1,
  "winnerShare": 14250,
  "isWinner": true,
  "withdrawal": null,
  "winners": [
    {
      "userId": "user-id",
      "name": "Igor",
      "position": 1,
      "totalPoints": 85,
      "exactMatches": 5
    }
  ]
}
```

**Response 200** (winner with existing withdrawal):
```json
{
  "prizeTotal": 14250,
  "winnerCount": 2,
  "winnerShare": 7125,
  "isWinner": true,
  "withdrawal": {
    "id": "uuid",
    "amount": 7125,
    "pixKeyType": "cpf",
    "pixKey": "12345678901",
    "status": "pending",
    "createdAt": "2026-07-14T12:00:00Z"
  },
  "winners": [...]
}
```

**Response 400** (pool not closed):
```json
{
  "error": "POOL_NOT_CLOSED",
  "message": "O bolao ainda nao foi finalizado."
}
```

---

## POST /api/pools/:poolId/prize/withdraw

Request prize withdrawal (winner only).

**Auth**: Required (must be a winner)

**Request**:
```json
{
  "pixKeyType": "cpf",
  "pixKey": "12345678901"
}
```

**Validation for pixKeyType**:
- `cpf`: 11 digits only
- `email`: valid email format
- `phone`: +55 followed by 10-11 digits
- `random`: UUID format (8-4-4-4-12 hex chars)

**Response 201**:
```json
{
  "id": "uuid",
  "poolId": "pool-uuid",
  "userId": "user-id",
  "amount": 14250,
  "pixKeyType": "cpf",
  "pixKey": "12345678901",
  "status": "pending",
  "createdAt": "2026-07-14T12:00:00Z"
}
```

**Response 400** (pool not closed):
```json
{
  "error": "POOL_NOT_CLOSED",
  "message": "O bolao ainda nao foi finalizado."
}
```

**Response 403** (not a winner):
```json
{
  "error": "NOT_A_WINNER",
  "message": "Apenas o vencedor pode solicitar a retirada do premio."
}
```

**Response 409** (already requested):
```json
{
  "error": "WITHDRAWAL_ALREADY_REQUESTED",
  "message": "Voce ja solicitou a retirada do premio deste bolao."
}
```

**Response 400** (invalid PIX key):
```json
{
  "error": "INVALID_PIX_KEY",
  "message": "A chave PIX informada e invalida para o tipo selecionado."
}
```

---

## Modified: POST /api/pools/:poolId/cancel

**Change**: Extend the existing prize check to block cancellation if ANY prize payment exists (not just completed ones).

**New Response 409** (prize requested):
```json
{
  "error": "PRIZE_WITHDRAWAL_REQUESTED",
  "message": "Nao e possivel cancelar o bolao apos solicitacao de retirada do premio."
}
```
