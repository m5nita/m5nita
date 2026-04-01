# Quickstart: Multi-Competition Support

## Prerequisites

- Node.js >= 20
- PostgreSQL 16 running
- pnpm installed
- football-data.org API key (`FOOTBALL_DATA_API_KEY` env var)
- Stripe API keys (real mode for e2e test)

## Setup

```bash
# Install dependencies
pnpm install

# Generate and apply migration
pnpm drizzle-kit generate
pnpm drizzle-kit migrate

# Start dev servers
pnpm dev
```

## Testing the Feature

### 1. Register La Liga via Telegram Bot

Send to the bot:
```
/competicao_criar PD "La Liga" 2025 league
```

### 2. Wait for Fixture Sync

Fixtures sync automatically every 6 hours, or restart the API to trigger immediate sync.

### 3. Create a Pool

In the web UI:
1. Go to "Criar Bolao"
2. Select "La Liga" from the competition dropdown
3. Choose matchday range (e.g., 30 to 30 for a single round)
4. Set entry fee to R$1.00
5. Complete Stripe payment

### 4. Share Invite

Copy the invite link and share with participants.

### 5. Make Predictions

Each participant predicts scores for the matchday's games before they start.

### 6. Wait for Results

After the matchday games finish:
- Scores sync automatically (every 5 minutes for live games)
- Points are calculated
- Pool closes when all games in the matchday finish
- Winner is notified via Telegram

### 7. Prize Withdrawal

The winner can request PIX withdrawal from the pool detail page.

## Verification Checklist

- [ ] Competition created via Telegram bot command
- [ ] Matches synced with correct competitionId and stage="league"
- [ ] Pool created with competition and matchday filter
- [ ] Only filtered matches visible in pool predictions
- [ ] Predictions saved and validated against match start time
- [ ] Points calculated correctly when matches finish
- [ ] Pool closes when all matchday games finish
- [ ] Winner notified via Telegram
- [ ] Prize withdrawal via PIX works
- [ ] Existing World Cup pools unaffected by La Liga lifecycle
