# Feedback da retirada de prêmio — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar confirmação visível ao solicitar a retirada do prêmio e avisar o ganhador por notificação quando o admin marca o pagamento como pago pelo Telegram.

**Architecture:** A API passa a expor `paidAt` (derivado de `prize_withdrawal.updated_at`, sem coluna nova) e a listar retiradas pendentes na home. Um novo método `notifyWithdrawalPaid` na porta de notificação reaproveita a cadeia push → Telegram → e-mail já existente, disparado por `MarkWithdrawalPaidUseCase` dentro de try/catch. No front, um componente único `WithdrawalStatusCard` renderiza os dois estados (solicitada / paga) nas duas superfícies.

**Tech Stack:** TypeScript 5.x strict, Node ≥ 22, Hono, Drizzle ORM, Vitest, grammY, web-push, Resend, React 19, TanStack Query, Tailwind CSS v4.

## Global Constraints

- Valores monetários sempre em centavos (BRL); formatação via `formatBrl` (`@m5nita/shared`) no back e `formatCurrency` (`apps/web/src/lib/utils.ts`) no front.
- **`formatBrl` separa o símbolo com NBSP (U+00A0), não espaço comum.** Nenhum teste pode escrever `'R$ 240,00'` como literal — sempre comparar contra `formatBrl(...)` / `formatCurrency(...)`, senão falha por um caractere invisível.
- Textos de UI e de notificação em pt-BR. **Nenhum texto promete prazo de pagamento** — a fórmula aprovada é "Em análise — avisamos assim que o PIX for enviado."
- A chave PIX em claro só pode aparecer no alerta ao admin. Toda outra saída (API, push, Telegram do ganhador, e-mail, front) usa a versão mascarada (`***********1234`).
- O front **nunca** re-mascara a chave que veio da API.
- Estilo do front: card com borda, sem preenchimento branco, sem cantos arredondados, cabeçalhos em `font-display` uppercase com `tracking-widest`. Nada de `bg-surface` nem `rounded-*`.
- Lint/format com Biome: rodar `pnpm biome check --write .` antes de cada commit (o editor formata com Prettier e gera ruído se isso for pulado).
- Guardrails: `pnpm check:leaks` e `pnpm check:arch` precisam passar. Nunca estender as allow-lists `BASELINE_*` em `apps/api/src/_architecture.test.ts`.
- O hook de pre-commit falha neste repo quando há worktree ignorada; rodar as verificações à mão e commitar com `--no-verify`.
- Testes de integração precisam do Postgres de teste de pé (`docker compose up -d postgres-test`) e de `DATABASE_URL` apontando para a porta 5433.

## File Structure

**API — domínio e persistência**
- `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts` — tipo `PrizeWithdrawal` ganha `updatedAt`.
- `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts` — mapeia `updatedAt`; `markAsCompleted` passa a usar `.returning()`.

**API — aplicação**
- `apps/api/src/application/prize/GetPrizeInfoUseCase.ts` — expõe `paidAt`.
- `apps/api/src/application/prize/GetPendingPrizesUseCase.ts` — inclui retiradas pendentes.
- `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.ts` — dispara a notificação.
- `apps/api/src/application/ports/NotificationService.port.ts` — `WithdrawalPaidData` + `notifyWithdrawalPaid`.

**API — notificação**
- `apps/api/src/domain/notification/NotificationType.ts` — novo código no union.
- `apps/api/drizzle/0017_withdrawal_paid_notification_type.sql` + `apps/api/drizzle/meta/_journal.json`.
- `apps/api/src/infrastructure/external/CompositeNotificationService.ts` — roteamento de canais.
- `apps/api/src/infrastructure/external/TelegramNotificationService.ts` — `sendWithdrawalPaidMessage`.
- `apps/api/src/lib/resend.ts` — `sendWithdrawalPaidEmail`.
- `apps/api/src/container.ts` — nova wiring de `MarkWithdrawalPaidUseCase`.

**Shared**
- `packages/shared/src/types/index.ts` — `PrizeWithdrawal.paidAt`, `PendingPrize.withdrawal`.

**Web**
- `apps/web/src/components/pool/WithdrawalStatusCard.tsx` — **novo**, único responsável por renderizar o estado da retirada.
- `apps/web/src/components/pool/PrizeWithdrawal.tsx` — consome o card, remove `maskPixKey` e `SUPPORT_URL`.
- `apps/web/src/components/home/PendingPrizesSection.tsx` — consome o card.

**Ordem das tasks:** a migration (Task 2) vem **antes** dos adaptadores (Task 3) de propósito. O teste de integração `'holds exactly the codes the application sends'` compara o catálogo do banco com `NOTIFICATION_TYPE_CODES`; adicionar o código ao union sem a migration deixaria esse commit vermelho.

---

### Task 1: Expor `paidAt` na retirada

**Files:**
- Modify: `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts:1-11`
- Modify: `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts:25-146`
- Modify: `apps/api/src/application/prize/GetPrizeInfoUseCase.ts:22-29,72-85`
- Modify: `packages/shared/src/types/index.ts:217-226`
- Modify: `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.test.ts:17-27` (fixture)
- Test: `apps/api/src/application/prize/GetPrizeInfoUseCase.test.ts` (**criar**)

**Interfaces:**
- Produces: `PrizeWithdrawal` (domínio) com `updatedAt: Date`. `GetPrizeInfoUseCase.execute` retorna `withdrawal: { id, amount, pixKeyType, pixKey, status, createdAt, paidAt } | null`, com `paidAt: string | null`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/api/src/application/prize/GetPrizeInfoUseCase.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { RankingRepository } from '../../domain/ranking/RankingRepository.port'
import { GetPrizeInfoUseCase } from './GetPrizeInfoUseCase'

const REQUESTED_AT = new Date('2026-07-30T14:32:00.000Z')
const PAID_AT = new Date('2026-07-31T09:10:00.000Z')

function makeWithdrawal(status: string) {
  return {
    id: 'w-1',
    poolId: 'pool-1',
    userId: 'user-1',
    paymentId: 'pay-1',
    amount: 14000,
    pixKeyType: 'cpf',
    pixKey: '12345678909',
    status,
    createdAt: REQUESTED_AT,
    updatedAt: status === 'completed' ? PAID_AT : REQUESTED_AT,
  }
}

function makeUseCase(withdrawalStatus: string | null) {
  const poolRepo = {
    findByIdWithDetails: vi.fn().mockResolvedValue({
      id: 'pool-1',
      name: 'Bolão Um',
      status: 'closed',
      entryFee: 5000,
      memberCount: 3,
      coupon: null,
    }),
  } as unknown as PoolRepository

  const rankingRepo = {
    getPoolRanking: vi
      .fn()
      .mockResolvedValue([
        { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
      ]),
  } as unknown as RankingRepository

  const prizeWithdrawalRepo = {
    findByPoolAndUser: vi
      .fn()
      .mockResolvedValue(withdrawalStatus ? makeWithdrawal(withdrawalStatus) : null),
  } as unknown as PrizeWithdrawalRepository

  return new GetPrizeInfoUseCase(poolRepo, prizeWithdrawalRepo, rankingRepo)
}

describe('GetPrizeInfoUseCase — paidAt', () => {
  it('returns paidAt null while the withdrawal is pending', async () => {
    const result = await makeUseCase('pending').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.status).toBe('pending')
    expect(result.withdrawal?.paidAt).toBeNull()
    expect(result.withdrawal?.createdAt).toBe(REQUESTED_AT.toISOString())
  })

  it('returns paidAt from updatedAt once the withdrawal is completed', async () => {
    const result = await makeUseCase('completed').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.paidAt).toBe(PAID_AT.toISOString())
  })

  it('masks the pix key so the raw value never leaves the use case', async () => {
    const result = await makeUseCase('pending').execute({ poolId: 'pool-1', userId: 'user-1' })

    expect(result.withdrawal?.pixKey).not.toContain('12345')
    expect(result.withdrawal?.pixKey.endsWith('8909')).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prize/GetPrizeInfoUseCase.test.ts`
Expected: FAIL — `paidAt` não existe no objeto retornado (`expected undefined to be null`).

- [ ] **Step 3: Adicionar `updatedAt` ao tipo de domínio**

Em `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts`, em `export type PrizeWithdrawal`, logo após `createdAt: Date`:

```ts
  createdAt: Date
  updatedAt: Date
}
```

- [ ] **Step 4: Mapear `updatedAt` no repositório**

Em `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts`:

Em `findByPoolAndUser`, no objeto retornado, após `createdAt: row.createdAt,`:

```ts
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
```

Em `createWithPayment`, no objeto retornado dentro da transação, após `createdAt: row.createdAt,`:

```ts
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }
```

Em `markAsCompleted`, substituir o `update` do `prizeWithdrawal` e todo o `return` (o `existing` foi lido **antes** do update, então `existing.updatedAt` traria o valor antigo — usar `.returning()`):

```ts
      const [updated] = await tx
        .update(prizeWithdrawal)
        .set({ status: 'completed', updatedAt: sql`NOW()` })
        .where(eq(prizeWithdrawal.id, id))
        .returning()

      const updatedRow = updated as NonNullable<typeof updated>

      await tx
        .update(payment)
        .set({ status: 'completed', updatedAt: sql`NOW()` })
        .where(eq(payment.id, existing.paymentId))

      return {
        id: updatedRow.id,
        poolId: updatedRow.poolId,
        userId: updatedRow.userId,
        paymentId: updatedRow.paymentId,
        amount: updatedRow.amount,
        pixKeyType: updatedRow.pixKeyType,
        pixKey: decryptPixKey(updatedRow.pixKey),
        status: updatedRow.status,
        createdAt: updatedRow.createdAt,
        updatedAt: updatedRow.updatedAt,
      }
```

- [ ] **Step 5: Expor `paidAt` no use case**

Em `apps/api/src/application/prize/GetPrizeInfoUseCase.ts`, no tipo `WithdrawalOutput`, após `createdAt: string`:

```ts
  createdAt: string
  paidAt: string | null
}
```

E no objeto montado dentro de `if (existing)`, após `createdAt: existing.createdAt.toISOString(),`:

```ts
          createdAt: existing.createdAt.toISOString(),
          paidAt: existing.status === 'completed' ? existing.updatedAt.toISOString() : null,
        }
```

- [ ] **Step 6: Atualizar o tipo compartilhado**

Em `packages/shared/src/types/index.ts`, na interface `PrizeWithdrawal`, após `createdAt: string`:

```ts
  createdAt: string
  /** ISO da confirmação de pagamento; null enquanto a retirada não foi paga. */
  paidAt: string | null
}
```

- [ ] **Step 7: Corrigir a fixture do teste existente**

Em `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.test.ts`, no objeto `completed`, após `createdAt: new Date('2026-04-20T12:00:00.000Z'),`:

```ts
      createdAt: new Date('2026-04-20T12:00:00.000Z'),
      updatedAt: new Date('2026-04-21T08:00:00.000Z'),
    }
```

> `DrizzlePrizeWithdrawalRepository.test.ts` **não** precisa de mudança: ele mocka `db.transaction` inteiro (`mockTransaction.mockResolvedValueOnce(...)`), então o callback de mapeamento nunca roda e o teste só verifica o passthrough do mock. O mapeamento real do Step 4 é coberto pelo teste de integração da Task 4.

- [ ] **Step 8: Rodar os testes e o typecheck**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/prize src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.test.ts
pnpm --filter @m5nita/api typecheck
pnpm --filter @m5nita/shared typecheck
```
Expected: todos PASS.

- [ ] **Step 9: Commit**

```bash
pnpm biome check --write .
git add apps/api/src packages/shared/src
git commit --no-verify -m "feat(036): expor paidAt na retirada de prêmio"
```

---

### Task 2: Tipo de notificação `withdrawal_paid` no catálogo

**Files:**
- Create: `apps/api/drizzle/0017_withdrawal_paid_notification_type.sql`
- Modify: `apps/api/drizzle/meta/_journal.json` (fim do array `entries`)
- Modify: `apps/api/src/domain/notification/NotificationType.ts:8-13`
- Test: `apps/api/tests/integration/scenarios/notification-preferences.test.ts:32-62`

**Interfaces:**
- Produces: código `'withdrawal_paid'` em `NotificationTypeCode` (usado pela Task 3) e a linha correspondente em `notification_type`, com `opt_outable = false`.

- [ ] **Step 1: Atualizar os três testes de catálogo que passam a falhar**

Em `apps/api/tests/integration/scenarios/notification-preferences.test.ts`:

O teste `'holds exactly the codes the application sends'` compara o banco com `NOTIFICATION_TYPE_CODES` e passa a valer sozinho depois do Step 3 — **não mexer nele**.

Substituir o corpo de `'marks pool_result as the one type that cannot be silenced'` e renomeá-lo:

```ts
    it('marks the money-related types as the ones that cannot be silenced', async () => {
      const rows = await sql<
        { code: string; opt_outable: boolean }[]
      >`SELECT code, opt_outable FROM notification_type ORDER BY sort_order`
      expect(rows.filter((r) => !r.opt_outable).map((r) => r.code)).toEqual([
        'pool_result',
        'withdrawal_paid',
      ])
    })
```

E, em `'lists the catalog in display order'`, adicionar o novo código ao array esperado:

```ts
      expect(types.map((t) => t.code)).toEqual([
        'new_pool',
        'prediction_reminder',
        'match_points',
        'pool_result',
        'withdrawal_paid',
      ])
```

Adicionar, no `describe('catalog seeded by migration 0016', …)`, um teste do rótulo:

```ts
    it('describes withdrawal_paid with the label the settings screen renders', async () => {
      const rows = await sql<
        { label: string; default_enabled: boolean }[]
      >`SELECT label, default_enabled FROM notification_type WHERE code = 'withdrawal_paid'`
      expect(rows).toMatchObject([{ label: 'Prêmio pago', default_enabled: true }])
    })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
docker compose up -d postgres-test
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration scenarios/notification-preferences.test.ts
```
Expected: FAIL — o catálogo tem 4 códigos e nenhum `withdrawal_paid`.

- [ ] **Step 3: Registrar o código na aplicação**

Em `apps/api/src/domain/notification/NotificationType.ts`, no array `NOTIFICATION_TYPE_CODES`, após `'pool_result',`:

```ts
  'pool_result',
  'withdrawal_paid',
] as const
```

- [ ] **Step 4: Criar a migration**

Criar `apps/api/drizzle/0017_withdrawal_paid_notification_type.sql`:

```sql
INSERT INTO "notification_type" ("code", "label", "description", "opt_outable", "default_enabled", "sort_order") VALUES
	('withdrawal_paid', 'Prêmio pago', 'Aviso de que o PIX do seu prêmio foi enviado.', false, true, 5)
ON CONFLICT ("code") DO NOTHING;
```

- [ ] **Step 5: Registrar no journal com `when` maior que o da 0016**

Em `apps/api/drizzle/meta/_journal.json`, adicionar como última entrada do array `entries` (a `0016` usa `1785376522628`):

```json
    {
      "idx": 17,
      "version": "7",
      "when": 1785376522629,
      "tag": "0017_withdrawal_paid_notification_type",
      "breakpoints": true
    }
```

⚠️ Sem esse `when` maior, o migrate de boot pula a migration silenciosamente em produção. O sintoma é enganoso: `NotificationPreferences.allows` **falha aberto** para código desconhecido, então a notificação continua saindo — o único sinal é o tipo nunca aparecer em Configurações.

- [ ] **Step 6: Rodar e ver passar**

```bash
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration scenarios/notification-preferences.test.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
pnpm biome check --write .
git add apps/api/drizzle apps/api/src apps/api/tests
git commit --no-verify -m "feat(036): tipo de notificação withdrawal_paid no catálogo"
```

---

### Task 3: Porta e adaptadores de `notifyWithdrawalPaid`

**Files:**
- Modify: `apps/api/src/application/ports/NotificationService.port.ts:67-102`
- Modify: `apps/api/src/infrastructure/external/TelegramNotificationService.ts:21-42`
- Modify: `apps/api/src/lib/resend.ts` (fim do arquivo)
- Modify: `apps/api/src/infrastructure/external/CompositeNotificationService.ts:61-69,212-236`
- Test: `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts`

**Interfaces:**
- Consumes: código `'withdrawal_paid'` (Task 2).
- Produces: `WithdrawalPaidData` e `NotificationService.notifyWithdrawalPaid(data: WithdrawalPaidData): Promise<void>` (consumido pela Task 4); `TelegramNotificationService.sendWithdrawalPaidMessage(chatId: number, params: { poolName: string; amount: number; pixKey: string }): Promise<void>`; `sendWithdrawalPaidEmail(params: { to: string; winnerName: string | null; poolName: string; amount: number; pixKey: string }): Promise<void>`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/api/src/infrastructure/external/CompositeNotificationService.test.ts`:

Adicionar `sendWithdrawalPaidEmail` ao mock de `../../lib/resend` no topo do arquivo:

```ts
vi.mock('../../lib/resend', () => ({
  sendPredictionReminderEmail: vi.fn(async () => {}),
  sendWinnerEmail: vi.fn(async () => {}),
  sendWithdrawalPaidEmail: vi.fn(async () => {}),
}))
```

Ajustar o import de `../../lib/resend` e o de `@m5nita/shared`, e declarar o handle do mock junto dos existentes:

```ts
import { formatBrl } from '@m5nita/shared'
import {
  sendPredictionReminderEmail,
  sendWinnerEmail,
  sendWithdrawalPaidEmail,
} from '../../lib/resend'

const mockWithdrawalPaidEmail = sendWithdrawalPaidEmail as unknown as ReturnType<typeof vi.fn>
```

Adicionar `withdrawal_paid` ao `CATALOG` do arquivo, travado como `pool_result`:

```ts
  { code: 'pool_result', optOutable: false, sortOrder: 4 },
  { code: 'withdrawal_paid', optOutable: false, sortOrder: 5 },
```

E o novo bloco de testes ao final do arquivo:

```ts
describe('notifyWithdrawalPaid', () => {
  const DATA = {
    userId: 'user-1',
    userName: 'Igor',
    phoneNumber: '+5511999999999',
    email: 'igor@test.local',
    poolId: 'pool-1',
    poolName: 'Bolão Um',
    amount: 14000,
    pixKey: '*******8909',
  }

  it('delivers via push and stops there', async () => {
    const bot = makeBot()
    const webPush = makeWebPush()
    webPush.sendToUser.mockResolvedValue(true)
    const service = new CompositeNotificationService(bot, webPush, makeStore(), makePreferences())

    await service.notifyWithdrawalPaid(DATA)

    expect(webPush.sendToUser).toHaveBeenCalledWith('user-1', {
      title: 'Prêmio pago',
      body: `${formatBrl(14000)} do bolão Bolão Um foi enviado para sua chave PIX`,
      url: '/pools/pool-1',
      tag: 'paid-pool-1',
    })
    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWithdrawalPaidEmail).not.toHaveBeenCalled()
  })

  it('falls back to Telegram when push does not deliver', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    const calls = telegramCalls(bot)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toBe(4242)
    expect(String(calls[0]?.[1])).toContain(formatBrl(14000))
    expect(mockWithdrawalPaidEmail).not.toHaveBeenCalled()
  })

  it('falls back to email when there is no push and no chat', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(null)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(telegramCalls(bot)).toHaveLength(0)
    expect(mockWithdrawalPaidEmail).toHaveBeenCalledWith({
      to: 'igor@test.local',
      winnerName: 'Igor',
      poolName: 'Bolão Um',
      amount: 14000,
      pixKey: '*******8909',
    })
  })

  it('cannot be silenced — a stored opt-out on a locked type is ignored', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences({ 'user-1': { withdrawal_paid: false } }),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(telegramCalls(bot)).toHaveLength(1)
  })

  it('sends only the masked key it was given', async () => {
    const bot = makeBot()
    mockFindChatId.mockResolvedValue(4242)
    const service = new CompositeNotificationService(
      bot,
      makeWebPush(),
      makeStore(),
      makePreferences(),
    )

    await service.notifyWithdrawalPaid(DATA)

    expect(String(telegramCalls(bot)[0]?.[1])).not.toContain('12345678909')
  })
})
```

> Se o `beforeEach` do arquivo não chamar `vi.clearAllMocks()`, adicionar `mockWithdrawalPaidEmail.mockClear()` a ele.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @m5nita/api exec vitest run src/infrastructure/external/CompositeNotificationService.test.ts`
Expected: FAIL — `service.notifyWithdrawalPaid is not a function`.

- [ ] **Step 3: Declarar o contrato na porta**

Em `apps/api/src/application/ports/NotificationService.port.ts`, antes de `export interface NotificationService`:

```ts
/**
 * "Prêmio pago" — disparado quando o admin confirma o PIX pelo Telegram.
 * A chave PIX chega aqui já mascarada: a versão em claro só existe no alerta
 * ao admin.
 */
export interface WithdrawalPaidData {
  userId: string
  userName: string | null
  phoneNumber: string | null
  /** Já filtrado por emailVerified pelo chamador. */
  email: string | null
  poolId: string
  poolName: string
  amount: number
  pixKey: string
}
```

E dentro de `export interface NotificationService`, após `notifyNewPool(data: NewPoolData): Promise<void>`:

```ts
  notifyWithdrawalPaid(data: WithdrawalPaidData): Promise<void>
```

- [ ] **Step 4: Implementar o transporte Telegram**

Em `apps/api/src/infrastructure/external/TelegramNotificationService.ts`, logo depois de `sendWinnerMessage`:

```ts
  async sendWithdrawalPaidMessage(
    chatId: number,
    params: { poolName: string; amount: number; pixKey: string },
  ): Promise<void> {
    const linkLine = APP_URL ? `\n\n${APP_URL}` : ''

    const message =
      `💸 *Prêmio pago!*\n\n` +
      `${formatBrl(params.amount)} do bolão *${escapeMarkdown(params.poolName)}* ` +
      `foi enviado para a sua chave PIX \`${escapeMarkdown(params.pixKey)}\`.` +
      linkLine

    await this.bot.api.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
    })
  }
```

- [ ] **Step 5: Implementar o e-mail**

No fim de `apps/api/src/lib/resend.ts`:

```ts
// Prêmio pago — fallback de e-mail para quem não tem push nem Telegram.
export async function sendWithdrawalPaidEmail(params: {
  to: string
  winnerName: string | null
  poolName: string
  amount: number
  pixKey: string
}): Promise<void> {
  const name = params.winnerName ? escapeHtml(params.winnerName) : 'Campeão'
  const cta = appUrl() ? ctaButton(appUrl(), 'Ver no app') : ''

  const bodyHtml = `
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#333;">Boa, <strong>${name}</strong>!</p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#333;">
      O prêmio do bolão <strong>${escapeHtml(params.poolName)}</strong> foi enviado para a sua chave PIX
      <strong>${escapeHtml(params.pixKey)}</strong>.
    </p>
    <p style="margin:0 0 24px;font-size:18px;line-height:1.6;color:#000;font-weight:700;">
      ${formatBrl(params.amount)}
    </p>
    ${cta}
  `

  await resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `💸 Seu prêmio do bolão ${params.poolName} foi pago`,
    html: brandedEmail({ heading: 'Prêmio pago 💸', bodyHtml }),
  })
}
```

- [ ] **Step 6: Implementar o roteamento de canais**

Em `apps/api/src/infrastructure/external/CompositeNotificationService.ts`:

Adicionar `WithdrawalPaidData` ao bloco `import type` de `NotificationService.port` e `sendWithdrawalPaidEmail` ao import de `../../lib/resend`.

Adicionar o construtor de payload depois de `newPoolPushPayload`:

```ts
function withdrawalPaidPushPayload(data: WithdrawalPaidData): PushPayload {
  return {
    title: 'Prêmio pago',
    body: `${formatBrl(data.amount)} do bolão ${data.poolName} foi enviado para sua chave PIX`,
    url: `/pools/${data.poolId}`,
    tag: `paid-${data.poolId}`,
  }
}
```

E o método, depois de `deliverNewPool`:

```ts
  // Push → Telegram → e-mail, um canal por pessoa. O tipo é travado no catálogo
  // (opt_outable = false): aviso de dinheiro não pode ser silenciado.
  async notifyWithdrawalPaid(data: WithdrawalPaidData): Promise<void> {
    try {
      if (!(await this.allows(data.userId, 'withdrawal_paid'))) return
      if (await this.tryPush(data.userId, withdrawalPaidPushPayload(data))) return
      const chatId = data.phoneNumber ? await findChatIdByPhone(data.phoneNumber) : null
      if (chatId) {
        await this.telegram.sendWithdrawalPaidMessage(chatId, {
          poolName: data.poolName,
          amount: data.amount,
          pixKey: data.pixKey,
        })
        return
      }
      if (data.email) {
        await sendWithdrawalPaidEmail({
          to: data.email,
          winnerName: data.userName,
          poolName: data.poolName,
          amount: data.amount,
          pixKey: data.pixKey,
        })
      }
    } catch (error) {
      console.error(`[Notify] Failed withdrawal-paid notice for pool ${data.poolId}:`, error)
    }
  }
```

- [ ] **Step 7: Rodar e ver passar**

```bash
pnpm --filter @m5nita/api exec vitest run src/infrastructure/external/CompositeNotificationService.test.ts
pnpm --filter @m5nita/api typecheck
```
Expected: PASS (5 testes novos). O typecheck confirma que `CompositeNotificationService` é o único implementador da porta.

- [ ] **Step 8: Commit**

```bash
pnpm biome check --write .
git add apps/api/src
git commit --no-verify -m "feat(036): notificação de prêmio pago (push, Telegram, e-mail)"
```

---

### Task 4: Disparar a notificação ao marcar como pago

**Files:**
- Modify: `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.ts` (arquivo inteiro)
- Modify: `apps/api/src/container.ts:270`
- Test: `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.test.ts` (arquivo inteiro)
- Test: `apps/api/tests/integration/scenarios/prize-withdrawal.test.ts:146-170`

**Interfaces:**
- Consumes: `notifyWithdrawalPaid(data: WithdrawalPaidData)` (Task 3); `PrizeWithdrawal.updatedAt` (Task 1).
- Produces: `new MarkWithdrawalPaidUseCase(prizeWithdrawalRepo, poolRepo, notificationService)`.

- [ ] **Step 1: Escrever os testes que falham**

Substituir `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.test.ts` inteiro:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import { PrizeWithdrawalError } from '../../domain/prize/PrizeWithdrawalError'
import type { PrizeWithdrawalRepository } from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { NotificationService } from '../ports/NotificationService.port'
import { MarkWithdrawalPaidUseCase } from './MarkWithdrawalPaidUseCase'

const COMPLETED = {
  id: 'w-1',
  poolId: 'pool-1',
  userId: 'user-1',
  paymentId: 'pay-1',
  amount: 9500,
  pixKeyType: 'cpf',
  pixKey: '12345678909',
  status: 'completed',
  createdAt: new Date('2026-04-20T12:00:00.000Z'),
  updatedAt: new Date('2026-04-21T08:00:00.000Z'),
}

function makeRepo(overrides: Partial<PrizeWithdrawalRepository> = {}): PrizeWithdrawalRepository {
  return {
    findByPoolAndUser: vi.fn(),
    createWithPayment: vi.fn(),
    markAsCompleted: vi.fn().mockResolvedValue(COMPLETED),
    ...overrides,
  }
}

function makePoolRepo(): PoolRepository {
  return {
    findByIdWithDetails: vi.fn().mockResolvedValue({ id: 'pool-1', name: 'Bolão Um' }),
    getMembersWithContact: vi.fn().mockResolvedValue([
      {
        userId: 'user-1',
        name: 'Igor',
        phoneNumber: '+5511999999999',
        email: 'igor@test.local',
        emailVerified: true,
      },
      {
        userId: 'user-2',
        name: 'Maria',
        phoneNumber: null,
        email: 'maria@test.local',
        emailVerified: true,
      },
    ]),
  } as unknown as PoolRepository
}

function makeNotifications(): NotificationService {
  return { notifyWithdrawalPaid: vi.fn(async () => {}) } as unknown as NotificationService
}

describe('MarkWithdrawalPaidUseCase', () => {
  it('delegates to repo.markAsCompleted and returns the updated withdrawal', async () => {
    const repo = makeRepo()
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), makeNotifications())

    const result = await useCase.execute({ withdrawalId: 'w-1' })

    expect(repo.markAsCompleted).toHaveBeenCalledWith('w-1')
    expect(result).toBe(COMPLETED)
  })

  it('notifies the winner with a masked pix key', async () => {
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), makePoolRepo(), notifications)

    await useCase.execute({ withdrawalId: 'w-1' })

    expect(notifications.notifyWithdrawalPaid).toHaveBeenCalledWith({
      userId: 'user-1',
      userName: 'Igor',
      phoneNumber: '+5511999999999',
      email: 'igor@test.local',
      poolId: 'pool-1',
      poolName: 'Bolão Um',
      amount: 9500,
      pixKey: '*******8909',
    })
  })

  it('omits an unverified email so the fallback never reaches an unconfirmed address', async () => {
    const poolRepo = {
      findByIdWithDetails: vi.fn().mockResolvedValue({ id: 'pool-1', name: 'Bolão Um' }),
      getMembersWithContact: vi.fn().mockResolvedValue([
        {
          userId: 'user-1',
          name: 'Igor',
          phoneNumber: null,
          email: 'igor@test.local',
          emailVerified: false,
        },
      ]),
    } as unknown as PoolRepository
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), poolRepo, notifications)

    await useCase.execute({ withdrawalId: 'w-1' })

    expect(notifications.notifyWithdrawalPaid).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    )
  })

  it('still completes when the notification throws — the money already moved', async () => {
    const notifications = {
      notifyWithdrawalPaid: vi.fn().mockRejectedValue(new Error('push down')),
    } as unknown as NotificationService
    const useCase = new MarkWithdrawalPaidUseCase(makeRepo(), makePoolRepo(), notifications)

    const result = await useCase.execute({ withdrawalId: 'w-1' })

    expect(result).toBe(COMPLETED)
  })

  it('propagates WITHDRAWAL_ALREADY_COMPLETED and never notifies', async () => {
    const repo = makeRepo({
      markAsCompleted: vi
        .fn()
        .mockRejectedValue(
          new PrizeWithdrawalError('WITHDRAWAL_ALREADY_COMPLETED', 'already paid'),
        ),
    })
    const notifications = makeNotifications()
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), notifications)

    await expect(useCase.execute({ withdrawalId: 'w-1' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_ALREADY_COMPLETED',
    })
    expect(notifications.notifyWithdrawalPaid).not.toHaveBeenCalled()
  })

  it('propagates WITHDRAWAL_NOT_FOUND from the repo', async () => {
    const repo = makeRepo({
      markAsCompleted: vi
        .fn()
        .mockRejectedValue(new PrizeWithdrawalError('WITHDRAWAL_NOT_FOUND', 'not found')),
    })
    const useCase = new MarkWithdrawalPaidUseCase(repo, makePoolRepo(), makeNotifications())

    await expect(useCase.execute({ withdrawalId: 'missing' })).rejects.toMatchObject({
      name: 'PrizeWithdrawalError',
      code: 'WITHDRAWAL_NOT_FOUND',
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prize/MarkWithdrawalPaidUseCase.test.ts`
Expected: FAIL — o construtor aceita só um argumento; `notifyWithdrawalPaid` nunca é chamado.

- [ ] **Step 3: Implementar o use case**

Substituir `apps/api/src/application/prize/MarkWithdrawalPaidUseCase.ts` inteiro:

```ts
import type { PoolRepository } from '../../domain/pool/PoolRepository.port'
import type {
  PrizeWithdrawal,
  PrizeWithdrawalRepository,
} from '../../domain/prize/PrizeWithdrawalRepository.port'
import type { NotificationService } from '../ports/NotificationService.port'

type Input = {
  withdrawalId: string
}

/** Só os 4 últimos dígitos: a chave em claro só existe no alerta ao admin. */
function maskPixKey(key: string): string {
  if (key.length <= 4) return key
  return `${'*'.repeat(key.length - 4)}${key.slice(-4)}`
}

export class MarkWithdrawalPaidUseCase {
  constructor(
    private readonly prizeWithdrawalRepo: PrizeWithdrawalRepository,
    private readonly poolRepo: PoolRepository,
    private readonly notificationService: NotificationService,
  ) {}

  async execute(input: Input): Promise<PrizeWithdrawal> {
    const withdrawal = await this.prizeWithdrawalRepo.markAsCompleted(input.withdrawalId)

    // O dinheiro já saiu e a transação já commitou. Uma falha de notificação
    // não pode fazer o botão do admin no Telegram responder erro e induzi-lo a
    // clicar de novo — o segundo clique bateria em WITHDRAWAL_ALREADY_COMPLETED.
    try {
      await this.notifyWinner(withdrawal)
    } catch (error) {
      console.error(`[Withdrawal] Failed to notify winner of ${withdrawal.id}:`, error)
    }

    return withdrawal
  }

  private async notifyWinner(withdrawal: PrizeWithdrawal): Promise<void> {
    const pool = await this.poolRepo.findByIdWithDetails(withdrawal.poolId)
    if (!pool) return

    const members = await this.poolRepo.getMembersWithContact(withdrawal.poolId)
    const winner = members.find((m) => m.userId === withdrawal.userId)

    await this.notificationService.notifyWithdrawalPaid({
      userId: withdrawal.userId,
      userName: winner?.name ?? null,
      phoneNumber: winner?.phoneNumber ?? null,
      email: winner?.emailVerified && winner.email ? winner.email : null,
      poolId: withdrawal.poolId,
      poolName: pool.name,
      amount: withdrawal.amount,
      pixKey: maskPixKey(withdrawal.pixKey),
    })
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prize/MarkWithdrawalPaidUseCase.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Atualizar a wiring do container**

Em `apps/api/src/container.ts`, substituir a linha 270:

```ts
    markWithdrawalPaidUseCase: new MarkWithdrawalPaidUseCase(
      prizeWithdrawalRepo,
      poolRepo,
      notificationService,
    ),
```

- [ ] **Step 6: Estender o cenário de integração**

Em `apps/api/tests/integration/scenarios/prize-withdrawal.test.ts`, no `scenario 2`, adicionar ao final do `it` (depois das asserções sobre `payment`):

```ts
    // A confirmação de pagamento fica exposta em GET /prize.
    const prizeResp = await exactPredictor.fetch(`/api/pools/${poolId}/prize`)
    expect(prizeResp.status).toBe(200)
    const prize = (await prizeResp.json()) as {
      withdrawal: { status: string; paidAt: string | null; pixKey: string } | null
    }
    expect(prize.withdrawal?.status).toBe('completed')
    expect(prize.withdrawal?.paidAt).toEqual(expect.any(String))
    // A chave em claro nunca sai da API.
    expect(prize.withdrawal?.pixKey).not.toContain('12345')
```

> Esse é o único teste que exercita o mapeamento real de `markAsCompleted` — o unit test do repositório mocka a transação inteira.

- [ ] **Step 7: Rodar a suíte completa**

```bash
pnpm --filter @m5nita/api exec vitest run
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration scenarios/prize-withdrawal.test.ts
pnpm check:leaks && pnpm check:arch
```
Expected: tudo PASS.

- [ ] **Step 8: Commit**

```bash
pnpm biome check --write .
git add apps/api/src apps/api/tests
git commit --no-verify -m "feat(036): avisar o ganhador quando o admin marca o prêmio como pago"
```

---

### Task 5: Home acompanha a retirada até o pagamento

**Files:**
- Modify: `apps/api/src/application/prize/GetPendingPrizesUseCase.ts:8-43`
- Modify: `packages/shared/src/types/index.ts:243-248`
- Test: `apps/api/src/application/prize/GetPendingPrizesUseCase.test.ts`

**Interfaces:**
- Consumes: `paidAt` de `GetPrizeInfoUseCase` (Task 1).
- Produces: `PendingPrizeItem` com `withdrawal: { amount, pixKey, status, requestedAt } | null`, consumido pela Task 8.

- [ ] **Step 1: Ajustar os testes existentes e adicionar os novos casos**

Em `apps/api/src/application/prize/GetPendingPrizesUseCase.test.ts`:

Nos casos que já passam (`'includes a closed pool where the user is a winner without a withdrawal'` e `'returns multiple items for mixed-state closed pools'`), adicionar `withdrawal: null` a cada item esperado:

```ts
    expect(result.items).toEqual([
      { poolId: 'p1', poolName: 'Bolão Um', winnerShare: 14000, winnerCount: 1, withdrawal: null },
    ])
```

```ts
    expect(result.items).toEqual([
      { poolId: 'p1', poolName: 'Bolão A', winnerShare: 10000, winnerCount: 1, withdrawal: null },
      { poolId: 'p3', poolName: 'Bolão C', winnerShare: 10000, winnerCount: 2, withdrawal: null },
    ])
```

Substituir o teste `'excludes a closed pool where the user already requested withdrawal'` por estes dois (note que as fixtures de `withdrawal` agora precisam de `paidAt`, obrigatório desde a Task 1):

```ts
  it('includes a closed pool with a pending withdrawal, carrying its state', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', name: 'Bolão Um', status: 'closed' })])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 14000,
        winnerCount: 1,
        winnerShare: 14000,
        isWinner: true,
        withdrawal: {
          id: 'w-1',
          amount: 14000,
          pixKeyType: 'cpf',
          pixKey: '*******8909',
          status: 'pending',
          createdAt: '2026-07-30T14:32:00.000Z',
          paidAt: null,
        },
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([
      {
        poolId: 'p1',
        poolName: 'Bolão Um',
        winnerShare: 14000,
        winnerCount: 1,
        withdrawal: {
          amount: 14000,
          pixKey: '*******8909',
          status: 'pending',
          requestedAt: '2026-07-30T14:32:00.000Z',
        },
      },
    ])
  })

  it('excludes a closed pool whose withdrawal is already completed', async () => {
    const repo = makePoolRepo([makePoolListItem({ id: 'p1', name: 'Bolão Um', status: 'closed' })])
    const prizeInfo = makePrizeInfoUseCase({
      p1: {
        prizeTotal: 14000,
        winnerCount: 1,
        winnerShare: 14000,
        isWinner: true,
        withdrawal: {
          id: 'w-1',
          amount: 14000,
          pixKeyType: 'cpf',
          pixKey: '*******8909',
          status: 'completed',
          createdAt: '2026-07-30T14:32:00.000Z',
          paidAt: '2026-07-31T09:10:00.000Z',
        },
        winners: [
          { userId: 'user-1', name: 'Igor', position: 1, totalPoints: 30, exactMatches: 3 },
        ],
      },
    })
    const useCase = new GetPendingPrizesUseCase(repo, prizeInfo)

    const result = await useCase.execute({ userId: 'user-1' })

    expect(result.items).toEqual([])
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @m5nita/api exec vitest run src/application/prize/GetPendingPrizesUseCase.test.ts`
Expected: FAIL — itens sem a propriedade `withdrawal`; o caso pendente devolve lista vazia.

- [ ] **Step 3: Implementar**

Em `apps/api/src/application/prize/GetPendingPrizesUseCase.ts`, substituir o tipo `PendingPrizeItem`:

```ts
type PendingPrizeWithdrawal = {
  amount: number
  /** Já mascarada por GetPrizeInfoUseCase. */
  pixKey: string
  status: string
  requestedAt: string
}

type PendingPrizeItem = {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
  /** null enquanto o ganhador não enviou a chave PIX. */
  withdrawal: PendingPrizeWithdrawal | null
}
```

E dentro de `execute`, substituir o corpo do laço:

```ts
    for (const pool of closedPools) {
      const info = await this.getPrizeInfoUseCase.execute({ poolId: pool.id, userId })
      // Sai da lista só quando o dinheiro cai — até lá a home acompanha.
      if (!info.isWinner || info.withdrawal?.status === 'completed') continue

      items.push({
        poolId: pool.id,
        poolName: pool.name,
        winnerShare: info.winnerShare,
        winnerCount: info.winnerCount,
        withdrawal: info.withdrawal
          ? {
              amount: info.withdrawal.amount,
              pixKey: info.withdrawal.pixKey,
              status: info.withdrawal.status,
              requestedAt: info.withdrawal.createdAt,
            }
          : null,
      })
    }
```

- [ ] **Step 4: Atualizar o tipo compartilhado**

Em `packages/shared/src/types/index.ts`, substituir a interface `PendingPrize`:

```ts
export interface PendingPrizeWithdrawal {
  amount: number
  /** Já mascarada pela API — o front nunca re-mascara. */
  pixKey: string
  status: WithdrawalStatus
  requestedAt: string
}

export interface PendingPrize {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
  /** null enquanto o ganhador não enviou a chave PIX. */
  withdrawal: PendingPrizeWithdrawal | null
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
pnpm --filter @m5nita/api exec vitest run src/application/prize/GetPendingPrizesUseCase.test.ts
pnpm --filter @m5nita/shared typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write .
git add apps/api/src packages/shared/src
git commit --no-verify -m "feat(036): pending-prizes acompanha a retirada até o pagamento"
```

---

### Task 6: Componente `WithdrawalStatusCard`

**Files:**
- Create: `apps/web/src/components/pool/WithdrawalStatusCard.tsx`
- Test: `apps/web/src/components/pool/WithdrawalStatusCard.test.tsx`

**Interfaces:**
- Produces: `WithdrawalStatusCard` com props `{ amount: number; pixKey: string; status: string; requestedAt: string; paidAt?: string | null; poolName?: string; celebrateKey?: string | null }`, consumido pelas Tasks 7 e 8.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/components/pool/WithdrawalStatusCard.test.tsx`:

```tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { formatCurrency } from '../../lib/utils'
import { WithdrawalStatusCard } from './WithdrawalStatusCard'

afterEach(cleanup)

const BASE = {
  amount: 24000,
  pixKey: '*******8909',
  requestedAt: '2026-07-30T14:32:00.000Z',
}

describe('WithdrawalStatusCard', () => {
  it('renders the requested state without promising a deadline', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" />)

    expect(screen.getByText('Retirada solicitada')).toBeTruthy()
    // formatCurrency usa NBSP — comparar contra a função, nunca contra literal.
    expect(screen.getByText(formatCurrency(24000))).toBeTruthy()
    expect(screen.getByText(/avisamos assim que o PIX for enviado/i)).toBeTruthy()
    expect(screen.queryByText(/dias úteis/i)).toBeNull()
  })

  it('renders the paid state with the amount in focus', () => {
    render(
      <WithdrawalStatusCard
        {...BASE}
        status="completed"
        paidAt="2026-07-31T09:10:00.000Z"
        celebrateKey={null}
      />,
    )

    expect(screen.getByText('Prêmio pago')).toBeTruthy()
    expect(screen.getByText(formatCurrency(24000))).toBeTruthy()
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
  })

  it('shows the pix key exactly as the API sent it — never re-masked', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" />)

    expect(screen.getByText(/\*{7}8909/)).toBeTruthy()
  })

  it('renders the pool name when given', () => {
    render(<WithdrawalStatusCard {...BASE} status="pending" poolName="Bolão da firma" />)

    expect(screen.getByText('Bolão da firma')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/pool/WithdrawalStatusCard.test.tsx`
Expected: FAIL — `Failed to resolve import "./WithdrawalStatusCard"`.

- [ ] **Step 3: Implementar o componente**

Criar `apps/web/src/components/pool/WithdrawalStatusCard.tsx`:

```tsx
import { useCelebrateOnce } from '../../lib/celebrate'
import { formatCurrency, formatDate } from '../../lib/utils'
import { Confetti } from '../ui/Confetti'

interface WithdrawalStatusCardProps {
  amount: number
  /** Já mascarada pela API — nunca mascarar de novo aqui. */
  pixKey: string
  status: string
  requestedAt: string
  paidAt?: string | null
  poolName?: string
  /** Chave de celebração única (ex.: `paid:{poolId}`); null desliga o confete. */
  celebrateKey?: string | null
}

/**
 * Estado da retirada, nas duas superfícies que o mostram (home e hub do bolão).
 * Um lugar só para a regra "solicitada vs paga" não divergir entre elas.
 */
export function WithdrawalStatusCard({
  amount,
  pixKey,
  status,
  requestedAt,
  paidAt,
  poolName,
  celebrateKey = null,
}: WithdrawalStatusCardProps) {
  const isPaid = status === 'completed'
  // Hook incondicional (Rules of Hooks): a chave é null quando não há o que celebrar.
  const celebrate = useCelebrateOnce(isPaid && celebrateKey ? celebrateKey : null)

  if (isPaid) {
    return (
      <>
        {celebrate && <Confetti count={120} />}
        <div className="border-2 border-green bg-green/5 p-6 text-center">
          {poolName && (
            <p className="mb-1 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
              {poolName}
            </p>
          )}
          <p className="font-display text-xs font-bold uppercase tracking-widest text-green">
            Prêmio pago
          </p>
          <p className="mt-1 font-display text-5xl font-black leading-none text-green">
            {formatCurrency(amount)}
          </p>
          <p className="mt-2 text-xs text-gray-muted">
            enviado para {pixKey}
            {paidAt && ` em ${formatDate(paidAt)}`}
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="border-l-4 border-green bg-green/5 p-4">
      {poolName && (
        <p className="font-display text-sm font-bold uppercase tracking-wide text-black truncate">
          {poolName}
        </p>
      )}
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
        Retirada solicitada
      </p>
      <p className="mt-1 font-display text-3xl font-black leading-none text-green">
        {formatCurrency(amount)}
      </p>
      <p className="mt-2 text-xs text-gray-muted">
        PIX {pixKey} · {formatDate(requestedAt)}
      </p>
      <p className="mt-1 text-xs text-gray-muted">
        Em análise — avisamos assim que o PIX for enviado.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @m5nita/web exec vitest run src/components/pool/WithdrawalStatusCard.test.tsx
pnpm --filter @m5nita/web typecheck
```
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
pnpm biome check --write .
git add apps/web/src/components/pool
git commit --no-verify -m "feat(036): WithdrawalStatusCard com os estados solicitada e paga"
```

---

### Task 7: Hub do bolão usa o card e para de mascarar duas vezes

**Files:**
- Modify: `apps/web/src/components/pool/PrizeWithdrawal.tsx:1-20,56-60,110-149`

**Interfaces:**
- Consumes: `WithdrawalStatusCard` (Task 6); `withdrawal.paidAt` da API (Task 1).

- [ ] **Step 1: Remover `maskPixKey` e `SUPPORT_URL`**

Em `apps/web/src/components/pool/PrizeWithdrawal.tsx`, apagar a linha 14:

```tsx
const SUPPORT_URL = 'https://t.me/m5nita_bot?start=suporte'
```

e as linhas 16-20 inteiras:

```tsx
// Don't echo the full PIX key back on screen — keep just enough to recognize it.
function maskPixKey(key: string): string {
  if (key.length <= 4) return '•'.repeat(key.length)
  return `${key.slice(0, 2)}${'•'.repeat(Math.max(3, key.length - 4))}${key.slice(-2)}`
}
```

A API já entrega a chave mascarada; mascarar de novo produzia `**•••••••••••34`, ilegível. `SUPPORT_URL` só era usado no bloco de status `failed`, que sai no Step 2 — e nenhum código escreve esse status hoje.

- [ ] **Step 2: Trocar o bloco de status pelo card**

Substituir todo o bloco `{prize.isWinner && prize.withdrawal && ( … )}` (linhas 110-149) por:

```tsx
      {prize.isWinner && prize.withdrawal && (
        <WithdrawalStatusCard
          amount={prize.withdrawal.amount}
          pixKey={prize.withdrawal.pixKey}
          status={prize.withdrawal.status}
          requestedAt={prize.withdrawal.createdAt}
          paidAt={prize.withdrawal.paidAt}
          celebrateKey={`paid:${poolId}`}
        />
      )}
```

Adicionar o import junto dos outros de `./`:

```tsx
import { WithdrawalStatusCard } from './WithdrawalStatusCard'
```

- [ ] **Step 3: Ajustar o texto do hero para o estado pago**

Ainda em `PrizeWithdrawal.tsx`, substituir o parágrafo do hero "Você ganhou" (linhas 56-60):

```tsx
            <p className="mt-2 text-sm text-gray-dark">
              {prize.withdrawal?.status === 'completed'
                ? 'Prêmio pago — o valor já saiu para a sua chave PIX.'
                : prize.withdrawal
                  ? 'Parabéns! O prêmio é seu — acompanhe a retirada abaixo.'
                  : 'Parabéns! Informe sua chave PIX abaixo para receber o prêmio.'}
            </p>
```

- [ ] **Step 4: Confirmar que não sobrou código morto**

Run: `rg -n "SUPPORT_URL|maskPixKey" apps/web/src`
Expected: nenhuma ocorrência.

- [ ] **Step 5: Rodar testes e typecheck**

```bash
pnpm --filter @m5nita/web exec vitest run
pnpm --filter @m5nita/web typecheck
```
Expected: PASS, sem variável ou import não usados.

- [ ] **Step 6: Commit**

```bash
pnpm biome check --write .
git add apps/web/src/components/pool
git commit --no-verify -m "feat(036): hub do bolão usa WithdrawalStatusCard e corrige máscara dupla do PIX"
```

---

### Task 8: Home mostra o estado da retirada

**Files:**
- Modify: `apps/web/src/components/home/PendingPrizesSection.tsx` (arquivo inteiro)
- Test: `apps/web/src/components/home/PendingPrizesSection.test.tsx` (**criar**)

**Interfaces:**
- Consumes: `PendingPrize.withdrawal` (Task 5); `WithdrawalStatusCard` (Task 6).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/components/home/PendingPrizesSection.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockApiFetch = vi.fn()

vi.mock('../../lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

import { formatCurrency } from '../../lib/utils'
import { PendingPrizesSection } from './PendingPrizesSection'

afterEach(() => {
  cleanup()
  mockApiFetch.mockReset()
})

function renderSection(items: unknown[]) {
  mockApiFetch.mockResolvedValue({ ok: true, json: async () => ({ items }) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <PendingPrizesSection />
    </QueryClientProvider>,
  )
}

describe('PendingPrizesSection', () => {
  it('renders nothing when there are no prizes', async () => {
    renderSection([])

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled())
    expect(screen.queryByText('Seus prêmios')).toBeNull()
  })

  it('offers the withdrawal action when nothing was requested yet', async () => {
    renderSection([
      {
        poolId: 'p1',
        poolName: 'Bolão Um',
        winnerShare: 24000,
        winnerCount: 1,
        withdrawal: null,
      },
    ])

    expect(await screen.findByText('Solicitar retirada')).toBeTruthy()
    expect(screen.queryByText('Retirada solicitada')).toBeNull()
  })

  it('shows the requested state instead of the form once a withdrawal exists', async () => {
    renderSection([
      {
        poolId: 'p1',
        poolName: 'Bolão Um',
        winnerShare: 24000,
        winnerCount: 1,
        withdrawal: {
          amount: 24000,
          pixKey: '*******8909',
          status: 'pending',
          requestedAt: '2026-07-30T14:32:00.000Z',
        },
      },
    ])

    expect(await screen.findByText('Retirada solicitada')).toBeTruthy()
    expect(screen.getByText(formatCurrency(24000))).toBeTruthy()
    expect(screen.queryByText('Solicitar retirada')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm --filter @m5nita/web exec vitest run src/components/home/PendingPrizesSection.test.tsx`
Expected: FAIL — o terceiro teste não encontra "Retirada solicitada" (a seção só sabe renderizar o formulário).

- [ ] **Step 3: Implementar**

Substituir `apps/web/src/components/home/PendingPrizesSection.tsx` inteiro:

```tsx
import type { PendingPrize, PendingPrizesResponse } from '@m5nita/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'
import { PrizeWithdrawalForm } from '../pool/PrizeWithdrawalForm'
import { WithdrawalStatusCard } from '../pool/WithdrawalStatusCard'
import { Button } from '../ui/Button'

export function PendingPrizesSection() {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: ['pending-prizes'],
    queryFn: async (): Promise<PendingPrizesResponse> => {
      const res = await apiFetch('/api/users/me/pending-prizes')
      if (!res.ok) throw new Error('Erro ao carregar prêmios')
      return res.json()
    },
  })

  const items = data?.items ?? []
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Seus prêmios
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {items.map((item) =>
        item.withdrawal ? (
          <WithdrawalStatusCard
            key={item.poolId}
            poolName={item.poolName}
            amount={item.withdrawal.amount}
            pixKey={item.withdrawal.pixKey}
            status={item.withdrawal.status}
            requestedAt={item.withdrawal.requestedAt}
          />
        ) : (
          <PendingPrizeCard
            key={item.poolId}
            item={item}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ['pending-prizes'] })
              queryClient.invalidateQueries({ queryKey: ['prize', item.poolId] })
            }}
          />
        ),
      )}
    </section>
  )
}

function PendingPrizeCard({ item, onSuccess }: { item: PendingPrize; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-l-4 border-green bg-green/5 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-black truncate">
            {item.poolName}
          </p>
          <p className="text-[11px] text-gray-muted">Prêmio disponível</p>
        </div>
        <p className="font-display text-3xl font-black leading-none text-green whitespace-nowrap">
          {formatCurrency(item.winnerShare)}
        </p>
      </div>
      <Button
        variant={open ? 'secondary' : 'success'}
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 w-full"
      >
        {open ? 'Fechar' : 'Solicitar retirada'}
      </Button>
      {open && (
        <div className="mt-4">
          <PrizeWithdrawalForm poolId={item.poolId} onSuccess={onSuccess} />
        </div>
      )}
    </div>
  )
}
```

> O card "solicitada" da home não recebe `celebrateKey`: o confete do pagamento pertence ao hub do bolão, que é o destino do deep-link da notificação. Itens pagos nem chegam nesta lista (Task 5).

- [ ] **Step 4: Rodar e ver passar**

```bash
pnpm --filter @m5nita/web exec vitest run
pnpm --filter @m5nita/web typecheck
```
Expected: PASS.

- [ ] **Step 5: Verificação manual do fluxo completo**

```bash
docker compose up -d
pnpm --filter @m5nita/api db:migrate
pnpm --filter @m5nita/api db:seed
pnpm dev
```

Logar como o usuário ganhador do seed (login por telefone `+5511999999999`; o OTP sai no console do API como `[DEV] OTP for …`) e conferir, nesta ordem:

1. Home mostra "Seus prêmios" com o card e o botão "Solicitar retirada".
2. Enviar a chave PIX → o card vira "Retirada solicitada" com valor, chave legível (`*******8909`, não `**•••••34`) e o texto sem promessa de prazo.
3. Recarregar a página → o estado continua lá.
4. Abrir o hub do bolão → mesmo estado.
5. Marcar como pago (pelo botão do Telegram se o bot estiver configurado, senão via node REPL chamando `getContainer().markWithdrawalPaidUseCase.execute({ withdrawalId })`) → o item some da home; o hub mostra "Prêmio pago" com confete uma única vez. Recarregar: o bloco continua, o confete **não** repete.
6. Em Configurações, "Prêmio pago" aparece com o badge "Sempre ativo" e sem switch.

- [ ] **Step 6: Verificação final e commit**

```bash
pnpm biome check --write .
pnpm test
pnpm check:leaks && pnpm check:arch
DATABASE_URL=postgresql://m5nita_test:m5nita_test@localhost:5433/m5nita_test \
  pnpm --filter @m5nita/api test:integration
git add apps/web/src
git commit --no-verify -m "feat(036): home acompanha a retirada até o pagamento"
```

---

## Cobertura da spec

| Requisito da spec | Task |
|---|---|
| `WithdrawalStatusCard` compartilhado, dois estados | 6 |
| Hub do bolão usa o card | 7 |
| Home acompanha até o pagamento (endpoint + UI) | 5, 8 |
| `paidAt` sem coluna nova | 1 |
| Migration `0017` com bump do `when` | 2 |
| Porta `notifyWithdrawalPaid` + push/Telegram/e-mail | 3 |
| Disparo em `MarkWithdrawalPaidUseCase` com try/catch | 4 |
| Confete uma vez no estado pago | 6, 7 |
| Máscara dupla da chave PIX corrigida | 7 |
| Sem promessa de prazo | 6 (texto + teste que proíbe "dias úteis") |
| Chave em claro só no alerta ao admin | 3 (teste), 4 (mascaramento) |
| Tipo travado aparece como "Sempre ativo" | 2 (catálogo), 8 Step 5 (verificação manual) |
