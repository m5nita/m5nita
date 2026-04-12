# Research: Migração para Arquitetura Hexagonal com SOLID

**Date**: 2026-04-12

## Decision 1: Estrutura de Camadas

**Decision**: Três camadas — `domain/`, `application/`, `infrastructure/` — dentro de `apps/api/src/`.

**Rationale**: É a estrutura canônica da arquitetura hexagonal. O domínio fica no centro sem dependências, a application orquestra via use cases, e a infrastructure implementa os adapters. Compatível com o tamanho do projeto (~63 arquivos) sem over-engineering.

**Alternatives considered**:
- Feature-based (vertical slices por domínio, cada um com suas 3 camadas): Rejeitado — para um projeto desse porte, a separação horizontal é mais clara e evita duplicação de patterns.
- Onion architecture (com camada de domain services separada): Rejeitado — overhead desnecessário; domain services vivem dentro de `domain/` junto com entities.

## Decision 2: Dependency Injection

**Decision**: Manual wiring via `container.ts` (composition root). Sem framework DI.

**Rationale**: O projeto tem ~15 use cases e ~8 repositórios. Um DI container (tsyringe, awilix) adicionaria complexidade, decorators, e configuração runtime que não se justifica. Factory functions em um arquivo são explícitas, type-safe, e fáceis de debugar.

**Alternatives considered**:
- Awilix (DI container para Node.js): Rejeitado — adiciona dependência, magic strings, configuração imperativa.
- tsyringe (decorators-based DI): Rejeitado — requer `experimentalDecorators`, conflita com Biome/strict TypeScript.
- Hono middleware-based DI (c.set/c.get): Rejeitado — acopla DI ao framework HTTP.

## Decision 3: Value Objects — Classes vs Types

**Decision**: Classes com validação no constructor (factory method estático `of()` ou `create()`).

**Rationale**: Classes permitem: (1) validação no ponto de criação, (2) métodos de comportamento (`Money.percentage()`, `PoolStatus.canClose()`), (3) `instanceof` checks quando necessário. Value objects são imutáveis (fields `readonly`).

**Alternatives considered**:
- Branded types (`type Money = number & { __brand: 'Money' }`): Rejeitado — não validam em runtime, sem métodos, e branded types são frágeis com serialização.
- Plain interfaces + factory functions: Rejeitado — sem encapsulamento, validação espalhada, sem métodos.

## Decision 4: Mappers — Domain ↔ Persistence

**Decision**: Classe estática `XxxMapper` com métodos `toDomain()` e `toPersistence()` em `infrastructure/persistence/mappers/`.

**Rationale**: Mantém a separação entre Drizzle row types e domain entities. Os mappers são o único ponto que conhece ambos os lados. Simples e explícito.

**Alternatives considered**:
- Mappers dentro da entity (método `fromRow()`): Rejeitado — viola dependency rule (entity não pode conhecer Drizzle types).
- Automapper library: Rejeitado — overhead para ~3 mappers; mapeamento explícito é mais seguro.

## Decision 5: Tratamento Simplificado vs Completo

**Decision**: Pool, Prediction e Prize recebem tratamento completo (entity + VOs + ports + use cases). Match, Ranking, Competition e Coupon recebem tratamento simplificado (port de repositório + adapter, sem entity/use case).

**Rationale**: Avaliação baseada em complexidade de domínio:
- **Pool**: State machine (pending→active→closed→cancelled), fee calculations, invite code, coupon interaction → Completo
- **Prediction**: Lock rules, membership check, scoring → Completo
- **Prize**: Winner eligibility, PIX validation, prize splitting, transactions → Completo
- **Match**: Sync de API externa, status mapping → Infrastructure-heavy, pouca lógica de domínio
- **Ranking**: Uma query SQL complexa → Query-focused, não entity-focused
- **Competition**: CRUD básico → Sem regras de negócio
- **Coupon**: Validação simples + incremento de uso → Pode ficar como service injetado

**Alternatives considered**:
- Tudo completo: Rejeitado — over-engineering para CRUD simples (Constitution V: "pragmatic scope").
- Tudo simplificado: Rejeitado — perde o benefício principal de isolar regras de negócio complexas.

## Decision 6: Coexistência packages/shared e Domain Layer

**Decision**: Coexistem com escopos distintos. `packages/shared` mantém tipos de resposta da API (interfaces TS para o contrato HTTP), schemas Zod (validação de input HTTP), e constantes de negócio. `domain/` contém value objects e entities com lógica de negócio.

**Rationale**: Não há duplicação real — Zod valida "é um JSON válido com campos corretos?" enquanto value objects validam "é um EntryFee válido no domínio?". Constantes de negócio (SCORING.EXACT_MATCH, POOL.MIN_ENTRY_FEE) ficam no shared como source of truth, consumidas pelos value objects.

**Alternatives considered**:
- Mover tudo para domain: Rejeitado — frontend também usa os tipos do shared; mover quebraria a dependência.
- Deprecar shared: Rejeitado — shared serve o frontend e a API boundary; tem propósito claro e distinto.

## Decision 7: Background Jobs

**Decision**: Jobs ficam em `jobs/` como adaptadores de infraestrutura (entry points) e delegam para use cases via container.

**Rationale**: Jobs são equivalentes a routes HTTP — são "portas de entrada" que trigam operações. O pattern `job → use case → domain` é consistente com `route → use case → domain`.

**Alternatives considered**:
- Jobs como use cases: Rejeitado — jobs têm concerns de infraestrutura (scheduling, retries, error logging via Sentry) que não pertencem à application layer.
- Jobs direto no domain: Rejeitado — viola dependency rule.
