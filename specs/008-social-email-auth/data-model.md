# Data Model: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

## Entity Changes

### User (existing — modified)

No schema changes needed. The `email` column is already nullable.

| Field | Type | Change |
|-------|------|--------|
| email | text, nullable | **Behavior change**: New Telegram users will have an inert sentinel email (`@phone.noemail.internal`) instead of `@m5nita.app` |
| emailVerified | boolean, default false | Stays `false` for Telegram users |
| image | text, nullable | May now be populated from Google avatar |

### Account (existing — no changes)

Already supports multiple providers per user. Each social sign-in creates a new row.

| Field | Usage for new providers |
|-------|------------------------|
| providerId | `"google"`, `"magic-link"` |
| accountId | Provider's unique user ID |
| accessToken | OAuth access token (Google) |
| refreshToken | OAuth refresh token (Google) |
| idToken | OAuth ID token (Google) |

### Verification (existing — no changes)

Used by Better Auth's magic link plugin to store verification tokens.

| Field | Usage for magic links |
|-------|----------------------|
| identifier | User's email address |
| value | Magic link token (hashed) |
| expiresAt | Token expiry (default 15 min) |

## Data Migration

No data migration is required. Old `@m5nita.app` fake emails remain inert (they were never verified and phone-number is excluded from `trustedProviders`), so they cannot be auto-linked to real provider emails. New Telegram signups will use the sentinel `@phone.noemail.internal` domain.

## Relationships

```text
User (1) ──< Account (many)
  │
  ├── Account { providerId: "credential", accountId: phone } (Telegram OTP)
  ├── Account { providerId: "google", accountId: google-sub } (Google OAuth)
  └── Account { providerId: "magic-link", accountId: email } (Magic Link)

User (1) ──< Session (many)

Verification (standalone) ── magic link tokens
```

## Identity Spaces

| Space | Identifier | Providers | Auto-linking |
|-------|-----------|-----------|--------------|
| Phone | phoneNumber | Telegram OTP | No cross-linking |
| Email | email (verified) | Google, Magic Link | Auto-link by same email |

A single user can exist in only ONE identity space. Signing in via Telegram creates a phone-identity user. Signing in via Google/Magic Link creates an email-identity user. These are separate accounts even if the same person uses both.
