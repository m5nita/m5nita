# Data Model: Manita — Bolao Copa do Mundo 2026

**Date**: 2026-03-15
**Feature Branch**: `001-world-cup-pool-app`

## Entity Relationship Overview

```
User 1──N PoolMember N──1 Pool
User 1──N Payment    N──1 Pool
User 1──N Prediction N──1 Match
Pool  1──N Prediction
Pool  1──N PoolMember
Match 1──N Prediction
```

## Entities

### User

Gerenciado parcialmente pelo Better Auth (tabelas `user`, `session`, `account`, `verification`).

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | text | PK | ID gerado pelo Better Auth |
| name | text | nullable | Nome (preenchido no primeiro acesso) |
| phoneNumber | text | unique, not null | Telefone (+55DDDNNNNNNNNN) |
| phoneNumberVerified | boolean | default false | Verificado pelo OTP |
| email | text | nullable | Requerido pelo Better Auth, pode ser null |
| emailVerified | boolean | default false | Campo Better Auth |
| image | text | nullable | Campo Better Auth |
| createdAt | timestamp | not null, default now | |
| updatedAt | timestamp | not null, default now | |

**Notas:**
- `session`, `account` e `verification` sao tabelas gerenciadas pelo Better Auth.
- Sessao dura 90 dias com sliding window de 24h.

### Pool (Bolao)

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | uuid | PK, generated | |
| name | text | not null, 3-50 chars | Nome do bolao |
| entryFee | integer | not null, min 1000, max 100000 | Valor em centavos (R$ 10-1000) |
| ownerId | text | FK -> User.id, not null | Criador/admin |
| inviteCode | text | unique, not null | Codigo unico para convite |
| isOpen | boolean | not null, default true | Aceita novas entradas |
| status | text | not null, default 'active' | 'active', 'closed', 'cancelled' |
| createdAt | timestamp | not null, default now | |
| updatedAt | timestamp | not null, default now | |

**Estado de transicao:**
```
active → closed    (admin fecha manualmente)
active → cancelled (admin encerra com reembolso total)
closed → cancelled (admin encerra com reembolso total)
```
Nao e possivel cancelar apos distribuicao de premio.

**Validacoes:**
- `name`: 3-50 caracteres
- `entryFee`: 1000-100000 centavos (R$ 10,00 - R$ 1.000,00)
- `inviteCode`: gerado automaticamente, alfanumerico, 8 caracteres

### PoolMember

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | uuid | PK, generated | |
| poolId | uuid | FK -> Pool.id, not null | |
| userId | text | FK -> User.id, not null | |
| paymentId | uuid | FK -> Payment.id, not null | Pagamento que habilitou a entrada |
| joinedAt | timestamp | not null, default now | |

**Constraints:**
- UNIQUE (poolId, userId) — um usuario por bolao

### Payment

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | uuid | PK, generated | |
| userId | text | FK -> User.id, not null | |
| poolId | uuid | FK -> Pool.id, not null | |
| amount | integer | not null | Valor total em centavos |
| platformFee | integer | not null | Taxa 5% em centavos |
| stripePaymentIntentId | text | unique, nullable | ID do PaymentIntent |
| status | text | not null, default 'pending' | 'pending', 'completed', 'refunded', 'expired' |
| type | text | not null | 'entry', 'refund', 'prize' |
| createdAt | timestamp | not null, default now | |
| updatedAt | timestamp | not null, default now | |

**Estado de transicao:**
```
pending → completed  (webhook payment_intent.succeeded)
pending → expired    (timeout Pix 30min ou falha)
completed → refunded (admin remove membro ou encerra bolao)
```

**Calculo de taxa:**
- `platformFee = amount * 0.05`
- Premio total = `SUM(amount) - SUM(platformFee)` para entries do bolao

### Match

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | uuid | PK, generated | |
| externalId | integer | unique, not null | ID na API-Football |
| homeTeam | text | not null | Nome do time da casa |
| awayTeam | text | not null | Nome do visitante |
| homeFlag | text | nullable | URL/codigo bandeira |
| awayFlag | text | nullable | URL/codigo bandeira |
| homeScore | integer | nullable | Gols casa (null se nao jogou) |
| awayScore | integer | nullable | Gols visitante |
| stage | text | not null | Fase do torneio |
| group | text | nullable | Grupo (A-L, null em mata-mata) |
| matchDate | timestamp | not null | Data e hora do jogo |
| status | text | not null, default 'scheduled' | Status do jogo |
| createdAt | timestamp | not null, default now | |
| updatedAt | timestamp | not null, default now | |

**Valores de `stage`:**
- `group`, `round-of-32`, `round-of-16`, `quarter`, `semi`, `third-place`, `final`

**Valores de `status`:**
- `scheduled`, `live`, `finished`, `postponed`, `cancelled`

**Estado de transicao:**
```
scheduled → live       (jogo comecou)
live → finished        (jogo terminou)
scheduled → postponed  (adiado)
scheduled → cancelled  (cancelado)
postponed → scheduled  (reagendado)
```

### Prediction (Palpite)

| Campo | Tipo | Constraints | Descricao |
|-------|------|-------------|-----------|
| id | uuid | PK, generated | |
| userId | text | FK -> User.id, not null | |
| poolId | uuid | FK -> Pool.id, not null | |
| matchId | uuid | FK -> Match.id, not null | |
| homeScore | integer | not null, >= 0 | Palpite gols casa |
| awayScore | integer | not null, >= 0 | Palpite gols visitante |
| points | integer | nullable | Pontos (calculado apos resultado) |
| createdAt | timestamp | not null, default now | |
| updatedAt | timestamp | not null, default now | |

**Constraints:**
- UNIQUE (userId, poolId, matchId) — um palpite por jogo por bolao por usuario
- Edicao permitida apenas enquanto `Match.matchDate > NOW()` (validacao server-side)

**Sistema de pontuacao (calculado quando Match.status = 'finished'):**

| Condicao | Pontos |
|----------|--------|
| Placar exato | 10 |
| Vencedor + diferenca de gols | 7 |
| Vencedor correto (placar diferente) | 5 |
| Empate correto (placar diferente) | 3 |
| Errou tudo | 0 |

## Indexes

| Tabela | Colunas | Tipo | Justificativa |
|--------|---------|------|---------------|
| Pool | inviteCode | unique | Lookup por convite |
| Pool | ownerId | index | Listar boloes do admin |
| PoolMember | poolId, userId | unique | Constraint de unicidade |
| PoolMember | userId | index | Listar boloes do usuario |
| Payment | stripePaymentIntentId | unique | Lookup webhook idempotente |
| Payment | userId, poolId | index | Historico de pagamentos |
| Match | externalId | unique | Sync com API-Football |
| Match | status | index | Filtrar jogos ao vivo/agendados |
| Match | matchDate | index | Ordenacao cronologica |
| Prediction | userId, poolId, matchId | unique | Constraint de unicidade |
| Prediction | poolId, userId | index | Ranking (soma de pontos por usuario no bolao) |
| Prediction | matchId | index | Calculo de pontos apos jogo |

## Ranking (View/Query)

O ranking nao e uma tabela dedicada. E calculado via query:

```sql
SELECT
  pm.userId,
  u.name,
  COALESCE(SUM(p.points), 0) AS totalPoints,
  COUNT(CASE WHEN p.points = 10 THEN 1 END) AS exactMatches,
  RANK() OVER (
    ORDER BY COALESCE(SUM(p.points), 0) DESC,
    COUNT(CASE WHEN p.points = 10 THEN 1 END) DESC
  ) AS position
FROM pool_member pm
JOIN "user" u ON u.id = pm.userId
LEFT JOIN prediction p ON p.userId = pm.userId AND p.poolId = pm.poolId
WHERE pm.poolId = :poolId
GROUP BY pm.userId, u.name
ORDER BY totalPoints DESC, exactMatches DESC
```

**Criterio de desempate:** Numero de acertos de placar exato (points = 10).
