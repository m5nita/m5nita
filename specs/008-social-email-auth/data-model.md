# Data Model: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

## Entity Changes

### User (existing — modified)

No schema changes needed. The `email` column is already nullable.

| Field | Type | Change |
|-------|------|--------|
| email | text, nullable | **Behavior change**: Telegram users will now have `null` instead of fake `{phone}@m5nita.app` |
| emailVerified | boolean, default false | **Data migration**: Set to `false` for users with `*@m5nita.app` emails |
| image | text, nullable | May now be populated from Google/Apple avatar |

### Account (existing — no changes)

Already supports multiple providers per user. Each social sign-in creates a new row.

| Field | Usage for new providers |
|-------|------------------------|
| providerId | `"google"`, `"apple"`, `"magic-link"` |
| accountId | Provider's unique user ID |
| accessToken | OAuth access token (Google/Apple) |
| refreshToken | OAuth refresh token (Google) |
| idToken | OAuth ID token (Google/Apple) |

### Verification (existing — no changes)

Used by Better Auth's magic link plugin to store verification tokens.

| Field | Usage for magic links |
|-------|----------------------|
| identifier | User's email address |
| value | Magic link token (hashed) |
| expiresAt | Token expiry (default 15 min) |

## Data Migration

### Migration: Clean fake Telegram emails

**Purpose**: Remove auto-generated fake emails from Telegram-only users.

```sql
UPDATE "user"
SET email = NULL, email_verified = false
WHERE email LIKE '%@m5nita.app';
```

**Impact**: All users who signed up via Telegram OTP will have their fake email cleared. This is safe because:
- These emails were never real or verified
- No other system depends on these fake emails
- After this migration, Telegram users are identified solely by `phoneNumber`

## Relationships

```text
User (1) ──< Account (many)
  │
  ├── Account { providerId: "credential", accountId: phone } (Telegram OTP)
  ├── Account { providerId: "google", accountId: google-sub } (Google OAuth)
  ├── Account { providerId: "apple", accountId: apple-sub } (Apple Sign-In)
  └── Account { providerId: "magic-link", accountId: email } (Magic Link)

User (1) ──< Session (many)

Verification (standalone) ── magic link tokens
```

## Identity Spaces

| Space | Identifier | Providers | Auto-linking |
|-------|-----------|-----------|--------------|
| Phone | phoneNumber | Telegram OTP | No cross-linking |
| Email | email (verified) | Google, Apple, Magic Link | Auto-link by same email |

A single user can exist in only ONE identity space. Signing in via Telegram creates a phone-identity user. Signing in via Google/Apple/Magic Link creates an email-identity user. These are separate accounts even if the same person uses both.
