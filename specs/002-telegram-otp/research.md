# Research: Replace Twilio with Telegram Bot for OTP Delivery

## 1. Telegram Bot Library Choice

**Decision:** grammY
**Rationale:** Native Hono adapter via `webhookCallback(bot, "hono")`, first-class TypeScript support, lightweight (~50KB), actively maintained, built-in webhook secret validation.
**Alternatives considered:**
- Raw `fetch`: Would work for our simple case but no typed update parsing or webhook validation out of the box
- Telegraf: Heavier (~150KB), no native Hono adapter, slower maintenance cycle
- node-telegram-bot-api: Poorly typed, barely maintained, polling-first design

## 2. Webhook vs Polling

**Decision:** Webhook
**Rationale:** We already run an Hono HTTP server. Adding a `/telegram/webhook` route is trivial. No need for a separate long-polling process.
**Alternatives considered:**
- Long polling: Would require a separate process or worker; unnecessary complexity when we have an HTTP server

## 3. Phone Number Format Normalization

**Decision:** Normalize to `+` prefix (e.g., `+5511999998888`) before storing
**Rationale:** Telegram returns phone numbers sometimes with `+` and sometimes without. Our app already uses `+55...` format everywhere (validated by `phoneSchema`). Normalizing on ingestion ensures consistent lookups.
**Alternatives considered:**
- Store without `+`: Would require changing all existing phone references throughout the app

## 4. Webhook Security

**Decision:** Use Telegram's `secret_token` parameter
**Rationale:** When setting the webhook, pass a `secret_token`. Telegram includes it as `X-Telegram-Bot-Api-Secret-Token` header on every request. grammY's `webhookCallback` validates this automatically.
**Alternatives considered:**
- IP whitelist: Telegram uses many IPs, fragile approach
- No validation: Security risk

## 5. Database Design for Phone→ChatID Mapping

**Decision:** New `telegram_chat` table with `phone_number` (PK/unique) and `chat_id` (bigint)
**Rationale:** Separate table keeps Telegram-specific data isolated from Better Auth's user table. Supports the case where a user registers their phone with the bot before creating an account. Also makes it easy to remove if we ever change messaging providers again.
**Alternatives considered:**
- Add `telegram_chat_id` column to `user` table: Would couple Telegram to the auth schema and not support pre-registration with the bot

## 6. Bot Username Deep Link

**Decision:** Use `https://t.me/{bot_username}?start=login` deep links
**Rationale:** Standard Telegram deep link format. The `start` parameter is passed to the bot when user opens it, confirming intent. Works on all platforms (iOS, Android, desktop, web).

## 7. Error Handling for Unregistered Phones

**Decision:** Return a specific error code when phone is not found in `telegram_chat` table
**Rationale:** The frontend needs to distinguish "wrong phone number" from "phone not connected to Telegram bot" to show appropriate instructions.
**Alternatives considered:**
- Generic error: Would confuse users who haven't connected their phone to the bot yet
