# Feedback da retirada de prêmio — Design

**Data:** 2026-07-30
**Status:** Aprovado para plano
**Origem:** feedback de usuário — não há confirmação ao enviar a chave PIX, nem aviso quando o admin marca o pagamento como pago pelo Telegram.

**Código relacionado:**
- `apps/web/src/components/pool/PrizeWithdrawal.tsx`, `PrizeWithdrawalForm.tsx`
- `apps/web/src/components/home/PendingPrizesSection.tsx`
- `apps/api/src/application/prize/GetPrizeInfoUseCase.ts`, `GetPendingPrizesUseCase.ts`, `MarkWithdrawalPaidUseCase.ts`
- `apps/api/src/application/ports/NotificationService.port.ts`
- `apps/api/src/infrastructure/external/CompositeNotificationService.ts`, `TelegramNotificationService.ts`
- `apps/api/src/infrastructure/persistence/DrizzlePrizeWithdrawalRepository.ts`
- `apps/api/src/domain/prize/PrizeWithdrawalRepository.port.ts`
- `apps/api/src/lib/telegram.ts` (callback `wd:pay:`)

## Problema

O fluxo de retirada tem dois pontos cegos, ambos em momentos que envolvem dinheiro:

1. **Ao enviar a chave PIX, nada confirma o envio.** Não existe sistema de toast no app (nenhum componente, hook ou biblioteca — `sonner`, `react-hot-toast` e afins não estão nas dependências). Na home, `PendingPrizesSection` apenas invalida a query no sucesso e, como `GetPendingPrizesUseCase` filtra por `info.withdrawal === null`, **o card simplesmente desaparece**. No hub do bolão, o bloco troca para um "Retirada solicitada" em cinza de 12px.

2. **Quando o admin marca como pago, o ganhador nunca é avisado.** `MarkWithdrawalPaidUseCase` só chama `markAsCompleted`; não recebe `NotificationService` e não existe `notifyWithdrawalPaid` na porta. O admin vê o rodapé "✅ Pago em … por @fulano" no Telegram dele; o ganhador não recebe push, Telegram nem e-mail. Só descobre se voltar ao bolão e ler "Status: Concluído".

3. **A chave PIX é mascarada duas vezes.** `GetPrizeInfoUseCase.maskPixKey` já devolve `***********1234`, e `PrizeWithdrawal.tsx` mascara de novo o que recebeu, produzindo `**•••••••••••34`. O usuário não consegue conferir a chave justamente quando quer.

## Objetivos

- O envio da chave PIX produz uma confirmação visível e persistente, na home e no hub do bolão.
- O pagamento do prêmio chega ao ganhador por notificação, na mesma cadeia de canais já usada pelo app.
- Ao abrir o app depois de pago, o ganhador encontra um momento de fechamento à altura do evento — não texto cinza.
- A chave PIX exibida é legível o suficiente para o ganhador reconhecê-la, e o servidor nunca devolve a chave completa.

## Não-objetivos

- Criar infraestrutura de toast. A mudança de estado inline É o feedback.
- Ressuscitar os status `processing` e `failed`: nenhum código os escreve hoje. As branches de UI inalcançáveis permanecem como estão — remoção ou implementação fica para uma spec própria.
- Permitir corrigir a chave PIX depois de enviada.
- Prometer prazo de pagamento. O texto diz que o usuário será avisado; a notificação de pago é o que substitui a promessa de SLA.

## Design

### 1. Estado da retirada no front

Um componente único, `WithdrawalStatusCard`, concentra a renderização do estado da retirada e é usado pelas duas superfícies. Props: `poolName?`, `amount`, `pixKey` (já mascarada pela API), `status`, `requestedAt`, `paidAt`.

Dois estados visuais:

**Solicitada** (`status !== 'completed'`)

```
┌│ COPA DO MUNDO — GRUPO A            │
 ││ Retirada solicitada                │
 ││ R$ 240,00                          │
 ││ PIX ···········1234 · 30/07 14:32  │
 ││ Em análise — avisamos assim que o  │
 ││ PIX for enviado                    │
 └────────────────────────────────────┘
```

**Paga** (`status === 'completed'`) — valor em destaque, chave e data do pagamento.

```
┌────────────────────────────────────┐
│           PRÊMIO PAGO              │
│           R$ 240,00                │
│   enviado para ···········1234     │
│   em 30/07 às 14:32                │
└────────────────────────────────────┘
```

O estado "paga" dispara `<Confetti>` uma única vez, sob `useCelebrateOnce('paid:{poolId}')` — mesmos helpers já usados pelo "Você ganhou", que já respeitam `prefers-reduced-motion`.

Segue o estilo editorial do app: card com borda, sem preenchimento branco, sem cantos arredondados, cabeçalho em `font-display` uppercase.

### 2. Home — o card acompanha até o pagamento

`GetPendingPrizesUseCase` passa a incluir também as retiradas já solicitadas e ainda não pagas. O filtro muda de `info.withdrawal === null` para `info.withdrawal?.status !== 'completed'`, e cada item carrega o estado da retirada:

```ts
type PendingPrizeItem = {
  poolId: string
  poolName: string
  winnerShare: number
  winnerCount: number
  withdrawal: {
    amount: number
    pixKey: string        // já mascarada pela API
    status: string
    requestedAt: string
  } | null
}
```

`PendingPrize` em `packages/shared/src/types/index.ts` ganha o mesmo campo.

`PendingPrizesSection` renderiza, por item:
- `withdrawal === null` → card atual (valor + botão "Solicitar retirada" que abre o formulário).
- `withdrawal != null` → `WithdrawalStatusCard` no estado "solicitada".

Quando pago, o item sai da lista; o fechamento acontece no hub do bolão, que é o destino do deep-link da notificação. O cabeçalho da seção passa de "Prêmios a retirar" para "Seus prêmios", que cobre os dois estados.

Valor exibido: `withdrawal.amount` quando existe (é o valor congelado no momento do pedido), senão `winnerShare`.

### 3. Hub do bolão

Em `PrizeWithdrawal.tsx`, a branch `prize.isWinner && prize.withdrawal` passa a renderizar `WithdrawalStatusCard` no lugar do bloco de texto atual. O `maskPixKey` local é removido — a API já mascara — e com isso deixa de existir código morto no arquivo.

A branch de `status === 'failed'` (com link de suporte) fica intocada: nenhum código a alcança hoje, e mexer nela está fora do escopo.

### 4. `paidAt` sem coluna nova

`prize_withdrawal.updated_at` só é escrito em `markAsCompleted` — o insert e a completação são as duas únicas escritas da linha *no caminho de produto*. Então a data de pagamento sai de `updatedAt`, sem migration de schema:

> ⚠️ **Ressalva:** essa premissa não é absoluta. `apps/api/src/scripts/backfillEncryptPixKeys.ts` também escreve `updatedAt: new Date()` — fora do fluxo de pagamento, ao migrar linhas com chave PIX ainda em texto plano para o formato cifrado. A escrita é protegida por `isEncryptedPixKey` (só toca linha que ainda está em claro) e o backfill já rodou em produção, então na prática nenhuma retirada `pending` teve seu `paidAt` inflado por engano — mas o código do script, se rodado de novo contra uma linha ainda em claro, tocaria `updated_at` sem que o prêmio tenha sido pago.

- `PrizeWithdrawal` em `PrizeWithdrawalRepository.port.ts` ganha `updatedAt: Date`; `DrizzlePrizeWithdrawalRepository` mapeia o campo em `findByPoolAndUser`, `createWithPayment` e `markAsCompleted`.
- `GetPrizeInfoUseCase` expõe `paidAt: string | null` — `updatedAt.toISOString()` quando `status === 'completed'`, senão `null`.
- `PrizeWithdrawal` em `packages/shared/src/types/index.ts` ganha `paidAt: string | null`.

Se um dia existir caminho de retry ou falha, `updatedAt` deixa de ser sinônimo de "pago" e a coluna dedicada passa a ser necessária. Isso está registrado aqui de propósito.

### 5. Notificação de prêmio pago

**Novo tipo no catálogo.** Migration `0017_withdrawal_paid_notification_type.sql`:

```sql
INSERT INTO "notification_type" ("code", "label", "description", "opt_outable", "default_enabled", "sort_order") VALUES
  ('withdrawal_paid', 'Prêmio pago', 'Aviso de que o PIX do seu prêmio foi enviado.', false, true, 5)
ON CONFLICT ("code") DO NOTHING;
```

`opt_outable = false`: é aviso de dinheiro e não deve poder ser silenciado. A tela de Configurações já renderiza tipo travado como badge "Sempre ativo" (`NotificationPreferencesSection.tsx`), e o catálogo é data-driven — nenhuma mudança de front é necessária.

⚠️ O `when` desta migration precisa ser maior que o da `0016` em `apps/api/drizzle/meta/_journal.json`, senão o migrate de boot a pula silenciosamente em produção.

`NOTIFICATION_TYPE_CODES` em `domain/notification/NotificationType.ts` ganha `'withdrawal_paid'`.

**Porta.** `NotificationService` ganha:

```ts
export interface WithdrawalPaidData {
  userId: string
  userName: string | null
  phoneNumber: string | null
  email: string | null          // já filtrado por emailVerified pelo chamador
  poolId: string
  poolName: string
  amount: number
  pixKey: string                // mascarada
}

notifyWithdrawalPaid(data: WithdrawalPaidData): Promise<void>
```

**Adaptador.** `CompositeNotificationService.notifyWithdrawalPaid` segue exatamente o formato de `deliverWinner`: gate de preferência (`withdrawal_paid`) → push → Telegram (via `findChatIdByPhone`) → e-mail, um canal por pessoa, tudo dentro de try/catch com `console.error`.

Payload de push:

```ts
{
  title: 'Prêmio pago',
  body: `${formatBrl(amount)} do bolão ${poolName} foi enviado para sua chave PIX`,
  url: `/pools/${poolId}`,
  tag: `paid-${poolId}`,
}
```

Telegram: `TelegramNotificationService.sendWithdrawalPaidMessage(chatId, data)`, no mesmo formato Markdown das demais, com a URL do app em linha própria e sem colchetes.
E-mail: `sendWithdrawalPaidEmail` em `lib/resend.ts`, espelhando `sendWinnerEmail` (mesmo `brandedEmail`, CTA para o bolão).

**Disparo.** `MarkWithdrawalPaidUseCase` passa a receber `poolRepo` e `notificationService`. Depois do `markAsCompleted`:

1. `poolRepo.findByIdWithDetails(withdrawal.poolId)` para o nome do bolão.
2. `poolRepo.getMembersWithContact(withdrawal.poolId)` para nome, telefone e e-mail do ganhador — mesmo caminho que `closePoolsJob` usa para os vencedores, com `email` só quando `emailVerified`.
3. `notifyWithdrawalPaid(...)` **dentro de try/catch com log**.

O try/catch é obrigatório: o dinheiro já foi transferido e o `markAsCompleted` já commitou quando a notificação roda. Uma falha de push não pode fazer o botão do admin no Telegram responder erro e induzi-lo a clicar de novo — o segundo clique bateria em `WITHDRAWAL_ALREADY_COMPLETED`.

A chave PIX vai mascarada para a notificação: a chave em claro só existe no alerta ao admin.

## Fluxos resultantes

**Ganhador solicita:**
1. Preenche a chave e envia, na home ou no hub.
2. O card vira "Retirada solicitada" com valor, chave mascarada, horário e "Em análise — avisamos assim que o PIX for enviado".
3. O card continua na home enquanto o pagamento não sai.

**Admin paga:**
1. Toca "✅ Marcar como pago"; a mensagem ganha o rodapé de auditoria como hoje.
2. O ganhador recebe push (ou Telegram, ou e-mail) com o valor e o bolão.
3. Toca na notificação → cai em `/pools/{poolId}` → bloco "PRÊMIO PAGO" com confete, uma vez só.
4. O item some da seção de prêmios da home.

## Testes

**API**
- `MarkWithdrawalPaidUseCase`: notifica no sucesso com os dados corretos; falha da notificação não propaga e a retirada continua completada; retirada já completada continua lançando `WITHDRAWAL_ALREADY_COMPLETED` antes de notificar.
- `CompositeNotificationService.notifyWithdrawalPaid`: respeita o gate de preferência; para no primeiro canal que entrega; cai para e-mail só quando não há push nem chat.
- `GetPendingPrizesUseCase`: retirada pendente aparece na lista com `withdrawal` preenchido; retirada completada não aparece; sem retirada aparece com `withdrawal: null`.
- Integração em `apps/api/tests/integration/scenarios/prize-withdrawal.test.ts`: depois do mark-paid, `GET /api/pools/:id/prize` devolve `status: 'completed'` e `paidAt` não nulo.

**Web**
- `WithdrawalStatusCard` renderiza os dois estados e mostra a chave como veio da API (sem re-mascarar).
- Depois do submit bem-sucedido, a home mostra o estado "solicitada" no lugar do formulário.

## Riscos

- `updatedAt` como `paidAt` é correto só enquanto a completação for a única atualização da linha *no fluxo de pagamento*. Documentado na seção 4 — inclui a ressalva do script `backfillEncryptPixKeys.ts`, que também escreve `updated_at` (fora do fluxo de pagamento, guardado por `isEncryptedPixKey`, e já rodado em produção — exposição fechada na prática).
- O `when` da migration `0017` precisa ser bumpado no `_journal.json`. Se a migration for pulada, `NotificationPreferences.allows` falha aberto (código desconhecido → permitido), então a notificação continua saindo — o sintoma é silencioso: o tipo nunca aparece em Configurações.
- `getMembersWithContact` carrega todos os membros do bolão para notificar um só ganhador. Aceitável no volume atual; se virar problema, o caminho é um `findContactByUserId` na porta de usuário.
