# Quickstart: Cupons de Desconto

## Pré-requisitos

- Node.js >= 20
- PostgreSQL 16 rodando
- Bot Telegram configurado (TELEGRAM_BOT_TOKEN)

## Setup

### 1. Configurar variáveis de ambiente

Adicionar ao `.env` do `apps/api`:

```bash
# IDs de Telegram dos administradores (comma-separated)
ADMIN_USER_IDS=123456789,987654321
```

Para descobrir seu Telegram user ID, envie `/start` ao bot [@userinfobot](https://t.me/userinfobot).

### 2. Gerar e aplicar migration

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### 3. Iniciar o dev server

```bash
pnpm dev
```

## Testando

### Via Telegram (admin)

1. Abra o bot no Telegram
2. Crie um cupom: `/cupom_criar TESTE 100`
3. Liste cupons: `/cupom_listar`
4. Desative: `/cupom_desativar TESTE`

### Via Frontend (usuário)

1. Acesse `/pools/create`
2. Preencha nome e valor
3. Insira o código do cupom no campo "Cupom de desconto"
4. Observe a taxa recalculada antes de confirmar

### Via API (curl)

Validar cupom:
```bash
curl -X POST http://localhost:3000/api/pools/validate-coupon \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"couponCode": "TESTE", "entryFee": 5000}'
```

Criar bolão com cupom:
```bash
curl -X POST http://localhost:3000/api/pools \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d '{"name": "Bolão Teste", "entryFee": 5000, "couponCode": "TESTE"}'
```

## Rodando testes

```bash
pnpm test
```
