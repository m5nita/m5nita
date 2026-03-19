# Quickstart: Telegram OTP Setup

## Prerequisites

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather):
   - Send `/newbot`
   - Name: `m5nita` (or desired display name)
   - Username: `m5nita_bot` (must end in `bot`)
   - Save the token

2. Set bot description via BotFather:
   - `/setdescription` → "Bot oficial do m5nita para envio de códigos de login"
   - `/setabouttext` → "Compartilhe seu telefone para receber códigos de login do m5nita"

## Environment Setup

```bash
# apps/api/.env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIjKlMnOpQrStUvWxYz
TELEGRAM_WEBHOOK_SECRET=your-random-secret-string-here
TELEGRAM_BOT_USERNAME=m5nita_bot
```

## Install Dependency

```bash
cd apps/api
pnpm add grammy
pnpm remove twilio
```

## Database Migration

```bash
pnpm drizzle-kit generate  # generates migration for telegram_chat table
pnpm drizzle-kit migrate   # applies migration
```

## Set Webhook (one-time per environment)

After deploying, register the webhook URL with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/api/telegram/webhook",
    "secret_token": "'${TELEGRAM_WEBHOOK_SECRET}'",
    "allowed_updates": ["message"],
    "drop_pending_updates": true
  }'
```

## Development

In development (`NODE_ENV !== 'production'`), OTP codes are logged to console (same behavior as before). The Telegram bot webhook is only active in production.

## Testing the Bot

1. Open `https://t.me/m5nita_bot` on your phone
2. Tap "Start"
3. Tap "Compartilhar telefone" button
4. Share your phone number
5. You should see: "Pronto! Agora você pode fazer login no m5nita."
6. Go to the web app, enter your phone, and you should receive the OTP in Telegram
