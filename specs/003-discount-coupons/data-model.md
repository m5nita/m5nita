# Data Model: Cupons de Desconto

## New Entity: `coupon`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, auto-generated | Identificador único |
| code | TEXT | UNIQUE, NOT NULL | Código do cupom (uppercase, alphanumeric) |
| discount_percent | INTEGER | NOT NULL, 1-100 | Percentual de desconto sobre a taxa da plataforma |
| status | TEXT | NOT NULL, default 'active' | 'active' ou 'inactive' |
| max_uses | INTEGER | NULLABLE | Limite máximo de usos (null = ilimitado) |
| use_count | INTEGER | NOT NULL, default 0 | Contador de usos |
| expires_at | TIMESTAMP | NULLABLE | Data de expiração (null = sem expiração) |
| created_by_telegram_id | BIGINT | NOT NULL | Telegram user ID do admin que criou |
| created_at | TIMESTAMP | NOT NULL, default now() | Data de criação |
| updated_at | TIMESTAMP | NOT NULL, default now() | Data de última atualização |

### Indexes

- `coupon_code_idx` UNIQUE on `code` — lookup rápido por código

### Validation Rules

- `code`: 2-20 caracteres, apenas letras (A-Z) e números (0-9), armazenado em uppercase
- `discount_percent`: inteiro entre 1 e 100
- `max_uses`: inteiro positivo ou null
- `use_count`: nunca pode exceder `max_uses` (quando definido)

### State Transitions

```
active → inactive  (admin desativa via Telegram)
```

Não há transição de volta para `active`. Para reativar, criar novo cupom.

## Modified Entity: `pool`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| coupon_id | UUID | NULLABLE, FK → coupon.id | Cupom aplicado ao bolão (null = taxa padrão) |

### New Index

- `pool_coupon_id_idx` on `coupon_id` — para queries de uso do cupom

## Relationships

```
coupon 1 ←→ N pool  (um cupom pode ser usado em vários bolões)
```

### Drizzle Relations Update

- `couponRelations`: `many(pool)` — um cupom tem vários pools
- `poolRelations`: adicionar `one(coupon)` via `pool.couponId → coupon.id`

## Fee Calculation

```
effectiveFeeRate = PLATFORM_FEE_RATE × (1 - discountPercent / 100)
platformFee = Math.floor(entryFee × effectiveFeeRate)
```

Exemplos (entryFee = 5000 centavos = R$ 50,00):
- Sem cupom: `5000 × 0.05 = 250` (R$ 2,50)
- Cupom 50%: `5000 × 0.025 = 125` (R$ 1,25)
- Cupom 100%: `5000 × 0 = 0` (R$ 0,00)
