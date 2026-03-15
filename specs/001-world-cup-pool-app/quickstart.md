# Quickstart: Manita

**Date**: 2026-03-15
**Feature Branch**: `001-world-cup-pool-app`

## Pre-requisitos

- Node.js >= 20
- pnpm >= 9
- Docker (para PostgreSQL e Redis locais)
- Conta Stripe (test mode)
- Conta API-Football (free tier para dev)
- Conta Twilio (para envio WhatsApp em dev — opcional, pode usar logs)

## Setup Inicial

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url> manita
cd manita
pnpm install
```

### 2. Subir servicos locais

```bash
docker compose up -d
```

Isso inicia:
- PostgreSQL na porta 5432
- Redis na porta 6379

### 3. Configurar variaveis de ambiente

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

**apps/api/.env:**
```
DATABASE_URL=postgresql://manita:manita@localhost:5432/manita
REDIS_URL=redis://localhost:6379

BETTER_AUTH_SECRET=<gerar-com-openssl-rand-base64-32>
BETTER_AUTH_URL=http://localhost:3001

STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

API_FOOTBALL_KEY=xxx
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io

TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_VERIFY_SERVICE_SID=xxx
```

**apps/web/.env:**
```
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

### 4. Gerar schema e rodar migracoes

```bash
# Gerar schema do Better Auth
cd apps/api
npx auth@latest generate

# Gerar e aplicar migracoes Drizzle
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### 5. Iniciar em dev

```bash
# Da raiz do monorepo
pnpm dev
```

- **API**: http://localhost:3001
- **Web**: http://localhost:5173

### 6. Stripe CLI (webhooks locais)

```bash
stripe listen --forward-to http://localhost:3001/api/webhooks/stripe
```

Copiar o `whsec_xxx` gerado para `STRIPE_WEBHOOK_SECRET` no `.env`.

## Estrutura do Monorepo

```
manita/
├── apps/
│   ├── api/               # Backend Hono + Drizzle
│   │   ├── src/
│   │   │   ├── routes/    # Rotas por dominio
│   │   │   ├── middleware/ # Auth, rate limit
│   │   │   ├── services/  # Logica de negocio
│   │   │   ├── schemas/   # Zod validation
│   │   │   ├── db/        # Drizzle schema + client
│   │   │   ├── jobs/      # Cron jobs
│   │   │   └── index.ts   # Entry point
│   │   ├── drizzle/       # Migration files
│   │   └── package.json
│   └── web/               # Frontend React + Vite
│       ├── src/
│       │   ├── routes/    # TanStack Router (file-based)
│       │   ├── components/ # UI components
│       │   ├── lib/       # Utils, API client, hooks
│       │   └── main.tsx
│       └── package.json
├── packages/
│   └── shared/            # Types, constantes, validacao
│       ├── src/
│       │   ├── types/     # Tipos compartilhados
│       │   ├── schemas/   # Zod schemas compartilhados
│       │   └── constants/ # Constantes (pontuacao, etc)
│       └── package.json
├── docker-compose.yml
├── pnpm-workspace.yaml
├── biome.json
└── package.json
```

## Fluxo de Desenvolvimento

1. Criar branch a partir de `001-world-cup-pool-app`
2. Implementar feature seguindo tasks.md
3. Rodar testes: `pnpm test`
4. Lint/format: `pnpm biome check --apply .`
5. Commit e PR

## Comandos Uteis

| Comando | Descricao |
|---------|-----------|
| `pnpm dev` | Inicia API + Web em modo dev |
| `pnpm build` | Build de producao |
| `pnpm test` | Roda testes |
| `pnpm biome check` | Lint + format check |
| `pnpm biome check --apply .` | Auto-fix lint/format |
| `pnpm drizzle-kit generate` | Gera migracoes |
| `pnpm drizzle-kit migrate` | Aplica migracoes |
| `pnpm drizzle-kit push` | Push direto (dev only) |
| `pnpm drizzle-kit studio` | UI visual do banco |
