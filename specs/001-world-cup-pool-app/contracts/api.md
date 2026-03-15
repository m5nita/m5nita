# API Contracts: Manita

**Date**: 2026-03-15
**Base URL**: `/api`

## Autenticacao (Better Auth)

Better Auth expoe endpoints automaticamente em `/api/auth/*`.
Os endpoints abaixo sao gerenciados pelo plugin Phone Number.

### POST /api/auth/phone-number/send-otp
Envia OTP via WhatsApp.

**Request:**
```json
{ "phoneNumber": "+5511999999999" }
```

**Response 200:**
```json
{ "success": true }
```

**Response 429:** Rate limit (3 req / 5 min por telefone)
```json
{ "error": "TOO_MANY_REQUESTS", "message": "Tente novamente em alguns minutos" }
```

### POST /api/auth/phone-number/verify-otp
Verifica OTP e cria/retorna sessao.

**Request:**
```json
{ "phoneNumber": "+5511999999999", "code": "123456" }
```

**Response 200:**
```json
{
  "user": { "id": "...", "name": null, "phoneNumber": "+5511999999999" },
  "session": { "token": "...", "expiresAt": "..." }
}
```

**Response 401:** Codigo invalido ou expirado

---

## User

### PATCH /api/users/me
Atualiza perfil do usuario autenticado.

**Headers:** Cookie de sessao (gerenciado pelo Better Auth)

**Request:**
```json
{ "name": "Igor Tullio" }
```

**Response 200:**
```json
{
  "id": "...",
  "name": "Igor Tullio",
  "phoneNumber": "+5511999999999"
}
```

**Validacao:** `name` 1-100 caracteres

### GET /api/users/me
Retorna perfil do usuario autenticado.

**Response 200:**
```json
{
  "id": "...",
  "name": "Igor Tullio",
  "phoneNumber": "+5511999999999"
}
```

---

## Pool (Bolao)

### POST /api/pools
Cria bolao. Retorna client_secret do Stripe para pagamento.

**Request:**
```json
{
  "name": "Bolao da Galera",
  "entryFee": 5000
}
```

**Response 201:**
```json
{
  "pool": {
    "id": "...",
    "name": "Bolao da Galera",
    "entryFee": 5000,
    "platformFee": 250,
    "inviteCode": "ABC12345",
    "status": "active",
    "isOpen": true,
    "ownerId": "..."
  },
  "payment": {
    "id": "...",
    "clientSecret": "pi_xxx_secret_xxx",
    "amount": 5000
  }
}
```

**Validacao:**
- `name`: 3-50 caracteres
- `entryFee`: 1000-100000 centavos

**Nota:** O bolao fica em estado pendente ate o pagamento ser confirmado via webhook.

### GET /api/pools
Lista boloes do usuario autenticado.

**Response 200:**
```json
{
  "pools": [
    {
      "id": "...",
      "name": "Bolao da Galera",
      "entryFee": 5000,
      "memberCount": 12,
      "userPosition": 3,
      "userPoints": 45,
      "status": "active"
    }
  ]
}
```

### GET /api/pools/:poolId
Detalhes de um bolao (usuario deve ser membro).

**Response 200:**
```json
{
  "id": "...",
  "name": "Bolao da Galera",
  "entryFee": 5000,
  "inviteCode": "ABC12345",
  "isOpen": true,
  "status": "active",
  "owner": { "id": "...", "name": "Igor" },
  "memberCount": 12,
  "prizeTotal": 57000,
  "userStats": {
    "position": 3,
    "totalPoints": 45,
    "predictionsCount": 20,
    "exactMatches": 2
  }
}
```

### GET /api/pools/invite/:inviteCode
Informacoes publicas do bolao para tela de convite.

**Response 200:**
```json
{
  "id": "...",
  "name": "Bolao da Galera",
  "entryFee": 5000,
  "platformFee": 250,
  "owner": { "name": "Igor" },
  "memberCount": 12,
  "prizeTotal": 57000,
  "isOpen": true
}
```

**Response 404:** Codigo invalido
**Response 409:** `{ "error": "ALREADY_MEMBER" }` ou `{ "error": "POOL_CLOSED" }`

### POST /api/pools/:poolId/join
Entrar no bolao. Retorna client_secret para pagamento.

**Request:** (vazio — poolId no path)

**Response 201:**
```json
{
  "payment": {
    "id": "...",
    "clientSecret": "pi_xxx_secret_xxx",
    "amount": 5000
  }
}
```

**Response 409:** `ALREADY_MEMBER` ou `POOL_CLOSED`

---

## Pool Admin

### PATCH /api/pools/:poolId
Atualiza bolao (apenas owner).

**Request:**
```json
{ "name": "Novo Nome", "isOpen": false }
```

**Response 200:** Pool atualizado

### GET /api/pools/:poolId/members
Lista membros (apenas owner).

**Response 200:**
```json
{
  "members": [
    { "id": "...", "userId": "...", "name": "Fulano", "joinedAt": "..." }
  ]
}
```

### DELETE /api/pools/:poolId/members/:memberId
Remove membro com reembolso (apenas owner).

**Response 200:**
```json
{ "refund": { "id": "...", "amount": 5000, "status": "pending" } }
```

### POST /api/pools/:poolId/cancel
Encerra bolao com reembolso total (apenas owner).

**Response 200:**
```json
{
  "pool": { "status": "cancelled" },
  "refunds": [
    { "userId": "...", "amount": 5000, "status": "pending" }
  ]
}
```

**Response 409:** `PRIZE_ALREADY_DISTRIBUTED`

---

## Matches (Jogos)

### GET /api/matches
Lista jogos com filtros.

**Query params:**
- `stage`: `group`, `round-of-32`, `round-of-16`, `quarter`, `semi`, `third-place`, `final`
- `group`: `A`-`L`
- `status`: `scheduled`, `live`, `finished`

**Response 200:**
```json
{
  "matches": [
    {
      "id": "...",
      "homeTeam": "Brasil",
      "awayTeam": "Alemanha",
      "homeFlag": "https://...",
      "awayFlag": "https://...",
      "homeScore": null,
      "awayScore": null,
      "stage": "group",
      "group": "A",
      "matchDate": "2026-06-11T18:00:00Z",
      "status": "scheduled"
    }
  ]
}
```

### GET /api/matches/live
Jogos ao vivo (para polling).

**Response 200:** Mesmo formato, apenas jogos com status `live`.

---

## Predictions (Palpites)

### GET /api/pools/:poolId/predictions
Lista palpites do usuario autenticado para um bolao.

**Response 200:**
```json
{
  "predictions": [
    {
      "id": "...",
      "matchId": "...",
      "homeScore": 2,
      "awayScore": 1,
      "points": 5,
      "match": {
        "homeTeam": "Brasil",
        "awayTeam": "Alemanha",
        "homeScore": 3,
        "awayScore": 1,
        "status": "finished",
        "matchDate": "..."
      }
    }
  ]
}
```

### PUT /api/pools/:poolId/predictions/:matchId
Cria ou atualiza palpite (upsert).

**Request:**
```json
{ "homeScore": 2, "awayScore": 1 }
```

**Response 200:**
```json
{
  "id": "...",
  "matchId": "...",
  "homeScore": 2,
  "awayScore": 1,
  "points": null
}
```

**Response 403:** Jogo ja comecou (`MATCH_STARTED`)
**Response 403:** Usuario nao e membro do bolao (`NOT_MEMBER`)

**Validacao:**
- `homeScore`, `awayScore`: inteiros >= 0
- `Match.matchDate > NOW()` (server-side)

---

## Ranking

### GET /api/pools/:poolId/ranking
Ranking do bolao.

**Response 200:**
```json
{
  "ranking": [
    {
      "position": 1,
      "userId": "...",
      "name": "Fulano",
      "totalPoints": 67,
      "exactMatches": 4,
      "isCurrentUser": false
    },
    {
      "position": 2,
      "userId": "...",
      "name": "Igor",
      "totalPoints": 45,
      "exactMatches": 2,
      "isCurrentUser": true
    }
  ],
  "prizeTotal": 57000
}
```

---

## Webhooks (Stripe → Backend)

### POST /api/webhooks/stripe
Recebe eventos do Stripe.

**Eventos tratados:**
- `payment_intent.succeeded` → confirma pagamento, cria PoolMember (se entry) ou cria Pool (se criacao)
- `payment_intent.payment_failed` → marca Payment como expired
- `charge.refunded` → marca Payment como refunded, remove PoolMember

**Headers requeridos:** `stripe-signature`
**Body:** Raw (nao parsed) para verificacao de assinatura

---

## Convencoes

- **Autenticacao**: Cookie de sessao gerenciado pelo Better Auth em todas as rotas `/api/*` (exceto auth e webhooks)
- **Erros**: `{ "error": "ERROR_CODE", "message": "Descricao legivel" }`
- **Datas**: ISO 8601 (UTC)
- **Valores monetarios**: Inteiros em centavos (BRL)
- **Paginacao**: Nao necessaria no MVP (boloes pequenos, max ~100 jogos)
