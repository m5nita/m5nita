# Feature Spec: Replace Twilio with Telegram Bot for OTP Delivery

**Branch**: `002-telegram-otp` | **Date**: 2026-03-19

## Problem

The current OTP delivery uses Twilio's WhatsApp API, which has recurring costs per message and requires a WhatsApp Business account. We need to replace it with Telegram Bot API, which is free and sufficient for our user base.

## Solution

Replace Twilio WhatsApp OTP delivery with a Telegram Bot that:

1. Receives users via `/start` command and collects their phone number via Telegram's contact-sharing keyboard button
2. Stores a `phone_number → chat_id` mapping in the database
3. Sends OTP codes as Telegram messages when users request login on the web app

## User Flow

### First-time Setup (one-time)
1. On the login page, user sees instructions to connect their Telegram first
2. User taps a link/button that opens the Telegram bot (deep link)
3. User sends `/start` to the bot
4. Bot requests phone number via special keyboard button (`request_contact`)
5. User shares their phone number with the bot
6. Bot confirms registration: "Pronto! Agora você pode fazer login no m5nita."
7. Bot stores `phone_number → chat_id` in the database

### Login (recurring)
1. User enters phone number on web app (same as today)
2. Backend looks up `chat_id` for the phone number in `telegram_chat` table
3. If found, sends OTP via Telegram Bot API to that `chat_id`
4. If not found, returns error asking user to connect Telegram first
5. User receives OTP in Telegram, enters it on web app
6. Authentication proceeds as before

## Requirements

### Functional
- R1: Telegram bot must accept `/start` and request phone contact
- R2: Bot must store phone→chat_id mapping persistently
- R3: OTP delivery must use Telegram Bot API `sendMessage`
- R4: Login page must show Telegram connection instructions for unregistered phones
- R5: Bot must handle phone number updates (re-sharing overwrites old mapping)
- R6: Remove all Twilio SDK code and dependencies

### Non-Functional
- R7: OTP delivery latency < 2 seconds via Telegram
- R8: Bot webhook must be secure (validate Telegram's secret token)
- R9: Graceful error handling if Telegram API is unavailable

## Out of Scope
- Telegram Login Widget (full OAuth replacement)
- Multi-channel OTP (supporting both Telegram and WhatsApp)
- Bot commands beyond `/start`

## Success Criteria
- Users can register their phone with the Telegram bot
- Users can log in using OTP received via Telegram
- Twilio dependency fully removed
- All existing auth tests pass with updated mocks
- OTP rate limiting still enforced
