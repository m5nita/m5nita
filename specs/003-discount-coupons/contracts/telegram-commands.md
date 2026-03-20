# Telegram Bot Commands: Coupon Management

## Authorization

Todos os comandos requerem que `ctx.from.id` esteja na lista `ADMIN_USER_IDS` (env var, comma-separated). Usuários não-autorizados recebem: "Você não tem permissão para este comando."

## Commands

### `/cupom_criar <code> <discount%> [duration] [maxUses]`

Cria um novo cupom de desconto.

**Arguments**:
- `code` (required): Código alfanumérico, 2-20 chars. Auto-uppercased.
- `discount%` (required): Inteiro 1-100. Percentual de desconto sobre a taxa.
- `duration` (optional): Duração em formato `Nd` (dias). Ex: `30d`. Default: sem expiração.
- `maxUses` (optional): Inteiro positivo. Limite de usos. Default: ilimitado.

**Examples**:
```
/cupom_criar COPA2026 100
/cupom_criar METADE 50 30d
/cupom_criar PROMO10 10 7d 100
```

**Success response**:
```
✅ Cupom criado!

Código: COPA2026
Desconto: 100% na taxa
Expira: Nunca
Limite de usos: Ilimitado
```

**Error responses**:
- Código já existe: "Código COPA2026 já está em uso."
- Formato inválido: "Uso: /cupom_criar CODIGO DESCONTO% [DIAS] [MAX_USOS]"
- Desconto fora de range: "Desconto deve ser entre 1 e 100."

---

### `/cupom_listar`

Lista todos os cupons.

**Success response**:
```
📋 Cupons (3):

1. COPA2026 — 100% off — Ativo — 5/∞ usos — Nunca expira
2. METADE — 50% off — Ativo — 3/10 usos — Expira 2026-04-18
3. PROMO10 — 10% off — Inativo — 100/100 usos — Expirado
```

**Empty response**:
```
Nenhum cupom cadastrado.
```

---

### `/cupom_desativar <code>`

Desativa um cupom existente.

**Arguments**:
- `code` (required): Código do cupom a desativar. Case-insensitive.

**Example**:
```
/cupom_desativar METADE
```

**Success response**:
```
✅ Cupom METADE desativado. Bolões existentes mantêm o desconto.
```

**Error responses**:
- Cupom não encontrado: "Cupom METADE não encontrado."
- Já inativo: "Cupom METADE já está inativo."
