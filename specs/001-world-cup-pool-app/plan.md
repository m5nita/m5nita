# Implementation Plan: Manita — Bolao Copa do Mundo 2026

**Branch**: `001-world-cup-pool-app` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-world-cup-pool-app/spec.md`

## Summary

Manita e um app web PWA mobile-first de bolao para a Copa do Mundo 2026. Usuarios autenticam via OTP por WhatsApp, criam boloes com entrada em dinheiro (Pix/cartao via Stripe), convidam amigos, fazem palpites nos jogos e disputam o premio. O 1o lugar em pontos leva tudo (menos 5% de taxa da plataforma).

A abordagem tecnica usa monorepo TypeScript com Hono (API), React 19 (frontend), Drizzle ORM (PostgreSQL), Better Auth (autenticacao), Stripe (pagamentos), API-Football (dados de jogos) e Tailwind CSS v4 (styling).

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**:
- Backend: Hono, Better Auth (phone-number plugin), Drizzle ORM, Stripe SDK, node-cron
- Frontend: React 19, TanStack Router, TanStack Query, Tailwind CSS v4, Stripe.js/React Stripe, vite-plugin-pwa
- Shared: Zod (validacao), tipos compartilhados
**Storage**: PostgreSQL 16 + Redis (rate limiting, cache)
**Testing**: Vitest (unit + integration), Playwright (e2e)
**Target Platform**: Web PWA (mobile-first, 390x844), navegadores modernos
**Project Type**: Web application (monorepo: apps/web + apps/api + packages/shared)
**Performance Goals**: FCP < 1.5s (4G), API p95 < 200ms, interacoes < 100ms
**Constraints**: Bundle size monitorado (+10KB requer justificativa), Pix timeout 30min, sessao 90 dias
**Scale/Scope**: 100 boloes simultaneos, 50 participantes/bolao, ~104 jogos Copa 2026, 11 telas

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality — PASS
- TypeScript strict mode com Biome para lint/format automatizado
- Drizzle + Zod garantem type safety end-to-end
- Hono RPC client elimina tipos duplicados entre frontend e backend
- Monorepo com `packages/shared` para logica reutilizada

### II. Testing Standards — PASS
- Vitest para unit + integration tests
- Playwright para e2e dos fluxos criticos (auth, criar bolao, palpites)
- Integration tests contra banco real (PostgreSQL via Docker)
- Contract tests para endpoints da API
- Benchmark para calculo de pontuacao (performance-sensitive path)

### III. UX Consistency — PASS
- Design system definido: Space Grotesk + Inter, paleta 5 cores, mobile-first 390x844
- Tailwind v4 com `@theme` para tokens do design system
- Componentes reutilizaveis para estados de loading, erro e vazio
- Sem bottom navigation — navegacao contextual consistente com back button + menu

### IV. Performance Requirements — PASS
- FCP < 1.5s: TanStack Router com code splitting automatico, Vite build otimizado
- API p95 < 200ms: Hono leve, queries indexadas (ver data-model.md)
- Interacoes < 100ms: debounce 500ms em palpites, optimistic updates via TanStack Query
- Bundle: Stripe.js carregado async, PWA precache de shell
- DB: indexes definidos para todas as queries frequentes (ranking, palpites, matches)

## Project Structure

### Documentation (this feature)

```text
specs/001-world-cup-pool-app/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: Technology research
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Dev setup guide
├── contracts/
│   └── api.md           # Phase 1: API endpoint contracts
└── tasks.md             # Phase 2: Task list (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts          # Better Auth mount
│   │   │   ├── users.ts         # PATCH/GET /users/me
│   │   │   ├── pools.ts         # CRUD boloes
│   │   │   ├── predictions.ts   # CRUD palpites
│   │   │   ├── matches.ts       # GET jogos
│   │   │   ├── ranking.ts       # GET ranking
│   │   │   └── webhooks.ts      # Stripe webhooks
│   │   ├── middleware/
│   │   │   ├── auth.ts          # Session middleware
│   │   │   └── rateLimit.ts     # Rate limiting
│   │   ├── services/
│   │   │   ├── pool.ts          # Logica de bolao
│   │   │   ├── payment.ts       # Stripe operations
│   │   │   ├── prediction.ts    # Palpites + pontuacao
│   │   │   ├── match.ts         # Sync API-Football
│   │   │   └── ranking.ts       # Calculo ranking
│   │   ├── schemas/             # Zod validation
│   │   ├── db/
│   │   │   ├── schema/          # Drizzle tables
│   │   │   ├── client.ts        # DB connection
│   │   │   └── seed.ts          # Dev seed data
│   │   ├── jobs/
│   │   │   ├── syncFixtures.ts  # Cron: sync jogos
│   │   │   ├── syncLive.ts      # Cron: live scores
│   │   │   └── calcPoints.ts    # Calculo pontos
│   │   └── index.ts
│   ├── drizzle/                 # Migration files
│   └── package.json
├── web/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── __root.tsx       # Root layout
│   │   │   ├── index.tsx        # Home
│   │   │   ├── login.tsx        # Auth
│   │   │   ├── complete-profile.tsx
│   │   │   ├── pools/
│   │   │   │   ├── create.tsx   # Criar bolao
│   │   │   │   └── $poolId/
│   │   │   │       ├── index.tsx      # Detalhes
│   │   │   │       ├── predictions.tsx # Palpites
│   │   │   │       ├── ranking.tsx    # Ranking
│   │   │   │       └── manage.tsx     # Admin
│   │   │   ├── invite/
│   │   │   │   └── $inviteCode.tsx    # Convite
│   │   │   ├── matches.tsx      # Calendario jogos
│   │   │   └── settings.tsx     # Configuracoes
│   │   ├── components/
│   │   │   ├── ui/              # Primitivos (button, input, card)
│   │   │   ├── match/           # Match card, bracket
│   │   │   ├── pool/            # Pool card, invite ticket
│   │   │   ├── prediction/      # Score input, points badge
│   │   │   └── layout/          # Header, navigation
│   │   ├── lib/
│   │   │   ├── api.ts           # Hono RPC client
│   │   │   ├── auth.ts          # Better Auth client
│   │   │   ├── stripe.ts        # Stripe Elements setup
│   │   │   └── utils.ts
│   │   ├── styles/
│   │   │   └── app.css          # Tailwind v4 @theme
│   │   └── main.tsx
│   └── package.json
packages/
└── shared/
    ├── src/
    │   ├── types/               # Tipos compartilhados
    │   ├── schemas/             # Zod schemas (pool, prediction, match)
    │   └── constants/           # Pontuacao, limites, etc.
    └── package.json

docker-compose.yml               # PostgreSQL + Redis
pnpm-workspace.yaml
biome.json
package.json
```

**Structure Decision**: Web application (monorepo) — `apps/api` e `apps/web` com `packages/shared` para tipos e validacao compartilhados. Escolhido por permitir deploy independente e compartilhamento type-safe de schemas Zod.

## Complexity Tracking

> Nenhuma violacao constitucional identificada. Todas as decisoes tecnicas estao alinhadas com os 4 principios.
