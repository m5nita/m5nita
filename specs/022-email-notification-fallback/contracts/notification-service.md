# Contract: NotificationService port & adapters

The feature does not add HTTP endpoints. The relevant contracts are the internal
`NotificationService` port and the adapters that satisfy it.

## Port: `NotificationService` (application/ports)

Method signatures are **unchanged**; only the `ReminderData` shape and `WinnerInfo` change
(see data-model.md).

```ts
interface NotificationService {
  notifyWinners(poolName: string, winners: WinnerInfo[], prizeShare: number): Promise<void>
  notifyAdminWithdrawalRequest(params: AdminWithdrawalRequestNotification): Promise<void>
  sendPredictionReminders(reminders: ReminderData[]): Promise<void>
}
```

Contract guarantees (verified by adapter tests):

- `sendPredictionReminders` / `notifyWinners` deliver each recipient via **exactly one
  channel** using the routing rule (Telegram-first, then verified email, else skip).
- A failure for one recipient MUST NOT prevent delivery to the rest (per-item isolation).
- `notifyAdminWithdrawalRequest` is delivered via Telegram only (unchanged).

## Adapter: `CompositeNotificationService` (infrastructure/external) — NEW

- `implements NotificationService`.
- Composes a `TelegramNotificationService` (transport) and the Resend email functions.
- `sendPredictionReminders(reminders)`: for each reminder, resolve a Telegram chat from
  `phoneNumber`; if present → `telegram.sendReminderMessage(chatId, …)`; else if `email` →
  `sendPredictionReminderEmail(…)`; else skip. Per-item try/catch.
- `notifyWinners(poolName, winners, prizeShare)`: same routing per winner →
  `telegram.sendWinnerMessage(chatId, …)` or `sendWinnerEmail(…)`.
- `notifyAdminWithdrawalRequest(params)`: delegates to `telegram.notifyAdminWithdrawalRequest`.

### Test scenarios (CompositeNotificationService.test.ts)

| Scenario | Expected |
|----------|----------|
| recipient with resolvable Telegram chat | Telegram send called; email NOT sent |
| recipient with no chat but verified email | email sent; Telegram NOT called |
| recipient with no phone but verified email | email sent |
| recipient with neither | nothing sent (no throw) |
| one recipient send throws | remaining recipients still processed |
| `notifyAdminWithdrawalRequest` | delegates to Telegram transport |

## Adapter: `TelegramNotificationService` (infrastructure/external) — refactor

Telegram transport with per-recipient primitives:

- `sendReminderMessage(chatId: number, params: { poolName; poolId; matches }): Promise<void>`
- `sendWinnerMessage(chatId: number, params: { poolName; winnerName: string | null; prizeShare: number }): Promise<void>`
- `notifyAdminWithdrawalRequest(params): Promise<void>` — unchanged.

No longer resolves `findChatIdByPhone` (the composite does) and no longer implements the
full port (the composite does). Markdown formatting is preserved.

## Email functions: `lib/resend.ts` — additions

- `sendPredictionReminderEmail(params: { to; userName: string | null; poolName; poolId; matches }): Promise<void>`
- `sendWinnerEmail(params: { to; winnerName: string | null; poolName; prizeShare: number }): Promise<void>`

Both use `from: 'M5nita <noreply@notifications.m5nita.com>'` and branded HTML consistent
with `sendMagicLinkEmail`.

### Test scenarios (resend.test.ts additions)

- reminder email: `to`/`from` correct; subject contains pool name; HTML contains a match
  line and the `/pools/{poolId}/predictions` link and the CTA label.
- winner email: subject contains pool name; HTML contains the formatted BRL prize and a
  withdrawal CTA/link.
