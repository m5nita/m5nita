# API Contracts: Telegram OTP

## Webhook Endpoint

### `POST /api/telegram/webhook`

Receives updates from Telegram Bot API. Not called by frontend.

**Headers:**
- `X-Telegram-Bot-Api-Secret-Token`: Must match `TELEGRAM_WEBHOOK_SECRET` env var

**Request Body:** Telegram `Update` object (handled by grammY)

**Response:** `200 OK` (always, per Telegram requirements)

**Security:** Secret token validation via grammY's `webhookCallback`

---

## Modified Auth Endpoints (Better Auth)

### `POST /api/auth/phone-number/send-otp`

No contract change. Same request/response as before.

**New behavior:**
- Looks up `chat_id` in `telegram_chat` table by phone number
- If found: sends OTP via Telegram Bot API `sendMessage`
- If not found: returns error with `code: "TELEGRAM_NOT_CONNECTED"`

**Request:**
```json
{ "phoneNumber": "+5511999999999" }
```

**Success Response (200):**
```json
{ "success": true }
```

**Error Response (400) — phone not connected:**
```json
{
  "error": {
    "message": "Phone not connected to Telegram",
    "code": "TELEGRAM_NOT_CONNECTED"
  }
}
```

### `POST /api/auth/phone-number/verify-otp`

No changes. Same contract as before.

---

## Environment Variables

### Removed
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

### Added
- `TELEGRAM_BOT_TOKEN` — Bot API token from BotFather
- `TELEGRAM_WEBHOOK_SECRET` — Random string for webhook validation
- `TELEGRAM_BOT_USERNAME` — Bot username (without @) for deep links
