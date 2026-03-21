# Quickstart: Critical Fixes + Telegram Prediction Reminders

## Prerequisites

- Node.js >= 20
- pnpm 9.x
- Docker (for PostgreSQL)
- Telegram bot token (for reminder testing)

## Setup

```bash
# Start infrastructure
docker compose up -d

# Install dependencies
pnpm install

# Copy env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
# Fill in values in both .env files

# Run migrations
cd apps/api && pnpm drizzle-kit migrate

# Start dev servers
pnpm dev
```

## Testing Changes

### OTP Rate Limit
```bash
# Send 4 OTP requests for same phone in quick succession
# 4th should return 429 with "Tente novamente em alguns minutos"
curl -X POST http://localhost:3001/api/auth/phone-number/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+5511999999999"}'
```

### Auth Guard
1. Open browser in incognito mode
2. Navigate to `http://localhost:5173/pools/create`
3. Should redirect to `/login` immediately (no content flash)

### Prediction Reminder
1. Seed a match with `matchDate` = now + 30 minutes, `status` = 'scheduled'
2. Ensure a pool member exists without a prediction for that match
3. Ensure the user's phone is linked in `telegram_chat`
4. Wait for the 15-minute cron job (or call `sendPredictionReminders()` directly)
5. Check Telegram for the reminder message

### Dead Code Cleanup
```bash
pnpm build      # Should succeed
pnpm test       # All tests should pass
pnpm typecheck  # No type errors
```

## Key Files

| File | Role |
|------|------|
| `apps/api/src/index.ts` | OTP middleware mount + reminder cron |
| `apps/api/src/jobs/reminderJob.ts` | Reminder job logic (NEW) |
| `apps/web/src/routes/pools/route.tsx` | Auth guard layout (NEW) |
| `apps/api/src/middleware/rateLimit.ts` | OTP rate limit definition (EXISTS) |
| `apps/api/src/lib/telegram.ts` | Bot + findChatIdByPhone (EXISTS) |
| `apps/web/src/lib/authGuard.ts` | requireAuthGuard (EXISTS) |
