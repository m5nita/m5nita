# Implementation Plan: Cupons de Desconto para Taxas de Bolão

**Branch**: `003-discount-coupons` | **Date**: 2026-03-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-discount-coupons/spec.md`

## Summary

Implementar sistema de cupons de desconto que reduzem a taxa da plataforma (5%) sobre entradas de bolões. Cupons são gerenciados por admins via bot Telegram (grammY), validados na criação de bolões via API REST, e vinculados ao bolão para que todos os membros se beneficiem da taxa reduzida. Admins são identificados por variável de ambiente `ADMIN_USER_IDS`.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js >= 20)
**Primary Dependencies**: Hono (API), grammY (Telegram bot), Drizzle ORM, Zod, React 19 + TanStack Router (frontend)
**Storage**: PostgreSQL 16 (nova tabela `coupon`, extensão da tabela `pool`)
**Testing**: Vitest
**Target Platform**: Web (PWA) + Telegram Bot
**Project Type**: Web service (monorepo: apps/api, apps/web, packages/shared)
**Performance Goals**: API responses < 200ms p95
**Constraints**: Valores monetários em centavos (BRL). Taxa padrão 5% (PLATFORM_FEE_RATE = 0.05). Desconto apenas percentual sobre a taxa.
**Scale/Scope**: Poucos admins (env var), centenas de cupons no máximo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Code Quality | PASS | Funções de responsabilidade única: service coupon separado, comandos Telegram isolados. Biome enforced. |
| II. Testing Standards | PASS | Unit tests para validação de cupom, cálculo de taxa. Integration tests para fluxo completo create pool + coupon. |
| III. UX Consistency | PASS | Campo de cupom opcional no formulário de criação, feedback visual de taxa original vs. com desconto. Mensagens de erro claras. |
| IV. Performance | PASS | Lookup de cupom por código (indexed). Nenhuma query N+1. Bundle impact mínimo (1 campo + 1 botão no form). |

## Project Structure

### Documentation (this feature)

```text
specs/003-discount-coupons/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── telegram-commands.md
│   └── rest-api.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
apps/api/
├── src/
│   ├── db/schema/
│   │   └── coupon.ts            # NEW: coupon table schema
│   ├── lib/
│   │   └── telegram.ts          # MODIFIED: add coupon admin commands
│   ├── services/
│   │   ├── coupon.ts            # NEW: coupon CRUD + validation service
│   │   ├── pool.ts              # MODIFIED: accept couponCode param, link coupon to pool
│   │   └── payment.ts           # MODIFIED: calculate fee with coupon discount
│   └── routes/
│       └── pools.ts             # MODIFIED: pass couponCode through create flow

apps/web/
├── src/
│   ├── routes/pools/
│   │   └── create.tsx           # MODIFIED: add coupon code input + discounted fee display
│   ├── routes/invite/
│   │   └── $inviteCode.tsx      # MODIFIED: show discounted fee info
│   └── lib/
│       └── utils.ts             # MODIFIED: add calculateDiscountedFee utility

packages/shared/
└── src/
    ├── schemas/index.ts         # MODIFIED: add couponCode to createPoolSchema
    └── constants/index.ts       # MODIFIED: add COUPON constants
```

**Structure Decision**: Segue a estrutura existente do monorepo. Coupon service como novo módulo em `apps/api/src/services/`. Comandos Telegram adicionados ao bot existente em `apps/api/src/lib/telegram.ts`. Sem novos packages ou apps.

## Complexity Tracking

Nenhuma violação da constituição. Não há complexidade adicional a justificar.
