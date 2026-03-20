# Research: Cupons de Desconto

## 1. Admin via Telegram Bot (grammY)

**Decision**: Adicionar comandos ao bot existente (`apps/api/src/lib/telegram.ts`) com middleware de autorização baseado em `ADMIN_USER_IDS` env var.

**Rationale**: O bot já existe e processa webhooks via Hono. grammY suporta `bot.command()` com filtros. Checar `ctx.from.id` contra a lista de IDs é trivial e seguro para o escopo atual (poucos admins).

**Alternatives considered**:
- API REST com auth middleware: Mais escopo (precisa de UI ou tooling externo). Descartado por simplicidade.
- Página admin no frontend: Escopo significativo de frontend. Descartado — Telegram já atende.

## 2. Validação e Aplicação de Cupom

**Decision**: Cupom é validado no momento da criação do bolão (POST /api/pools). O campo `couponId` é salvo na tabela `pool`. A taxa efetiva é calculada dinamicamente a partir do `discountPercent` do cupom vinculado ao pool.

**Rationale**: Vincular o cupom ao pool (não ao pagamento) garante que todos os membros se beneficiam. Calcular a taxa dinamicamente evita duplicação de dados e é consistente com o padrão atual (`POOL.PLATFORM_FEE_RATE`).

**Alternatives considered**:
- Salvar `effectiveFeeRate` no pool: Duplicação de dado derivável. Descartado.
- Vincular cupom ao pagamento individualmente: Contradiz o requisito de que o desconto é por bolão. Descartado.

## 3. Cálculo de Taxa com Desconto

**Decision**: `effectiveFeeRate = PLATFORM_FEE_RATE * (1 - discountPercent / 100)`. Usar `Math.floor()` para arredondar para baixo (a favor do usuário), consistente com o padrão existente.

**Rationale**: Fórmula simples e previsível. Exemplo: cupom 50% → taxa efetiva = 0.05 * 0.5 = 0.025 (2.5%). Cupom 100% → taxa = 0.

**Alternatives considered**:
- Arredondar para cima (ceil): Desfavorece o usuário. Descartado.
- Taxa fixa customizada: Mais flexível mas mais complexo. Descartado pelo usuário na clarificação.

## 4. Incremento de Uso do Cupom (Concorrência)

**Decision**: Usar `UPDATE coupon SET use_count = use_count + 1 WHERE id = ? AND (max_uses IS NULL OR use_count < max_uses)` com verificação de `rowCount > 0`. Se nenhuma row atualizada, cupom atingiu o limite.

**Rationale**: Operação atômica que previne race conditions sem necessidade de locks explícitos ou transações serializáveis. Padrão bem estabelecido para contadores com limite.

**Alternatives considered**:
- SELECT + check + UPDATE em transação: Suscetível a race condition sem serializable isolation. Descartado.
- Distributed lock: Over-engineering para o volume esperado. Descartado.

## 5. Formato dos Comandos Telegram

**Decision**: Comandos simples com argumentos posicionais separados por espaço:
- `/cupom_criar CODIGO 50` — cria cupom com 50% desconto, sem limite
- `/cupom_criar CODIGO 100 30d 10` — cria cupom 100%, expira em 30 dias, máximo 10 usos
- `/cupom_listar` — lista todos os cupons
- `/cupom_desativar CODIGO` — desativa cupom

**Rationale**: Formato conciso e intuitivo para uso em chat. Argumentos opcionais no final. Sem necessidade de conversação multi-step.

**Alternatives considered**:
- Conversation flow (multi-step): Mais user-friendly mas complexo de implementar com grammY conversations plugin. Descartado por simplicidade.
- Inline keyboards: Mais interativo mas limitado para input de texto (código, percentual). Descartado.
