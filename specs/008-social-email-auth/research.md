# Research: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

## Decision 1: Social Providers (Google & Apple)

**Decision**: Use Better Auth's built-in `socialProviders` config — no extra plugins needed.

**Rationale**: Google and Apple OAuth are first-class citizens in Better Auth core. Server-side config is minimal (`clientId` + `clientSecret` in `socialProviders`). Client-side uses `authClient.signIn.social({ provider: "google" })`. No additional packages required except `jose` for generating Apple's JWT client secret.

**Alternatives considered**:
- Manual OAuth2 implementation: Rejected — would duplicate what Better Auth already provides.
- Passport.js / next-auth: Rejected — different auth framework, incompatible with existing Better Auth setup.

**Key details**:
- Callback URLs auto-registered at `/api/auth/callback/google` and `/api/auth/callback/apple`.
- Apple requires `https://appleid.apple.com` in `trustedOrigins` (form_post flow).
- Apple `clientSecret` is a JWT signed with Apple private key (ES256), expires in max 6 months.
- `baseURL` must be set on server for OAuth callback URLs to resolve in production.

## Decision 2: Magic Link Plugin

**Decision**: Use Better Auth's built-in `magicLink` plugin from `better-auth/plugins`.

**Rationale**: Native plugin with full integration into Better Auth's session management, account creation, and account linking. Provides `sendMagicLink` callback for custom email delivery.

**Alternatives considered**:
- Custom magic link implementation: Rejected — Better Auth plugin handles token generation, verification, expiry, and session creation.
- Email/password with verification: Rejected — spec explicitly requires passwordless magic link flow.

**Key details**:
- Server: `import { magicLink } from "better-auth/plugins"` — config includes `sendMagicLink`, `expiresIn`, `disableSignUp`, `allowedAttempts`.
- Client: `import { magicLinkClient } from "better-auth/client/plugins"` — usage: `authClient.signIn.magicLink({ email, callbackURL })`.
- `allowedAttempts` defaults to 1 (single-use). Consider setting to 3 to handle email scanner bots consuming the link.
- `url` param in `sendMagicLink` is the full ready-to-use verification link.
- Provider identifier for account linking: `"magic-link"`.

## Decision 3: Account Linking Strategy

**Decision**: Use Better Auth's built-in `account.accountLinking` config with `trustedProviders: ["google", "apple", "magic-link"]`.

**Rationale**: Auto-links accounts by verified email across email-based providers. Phone-number (Telegram) accounts naturally stay isolated because once we remove fake emails (FR-017), they'll have `null` email — no collision possible.

**Alternatives considered**:
- Manual account linking logic: Rejected — Better Auth handles this natively.
- Include phone-number in trustedProviders: Rejected — Telegram and email-based providers are separate identity spaces per spec clarification.

**Key details**:
- `trustedProviders` array controls which providers can auto-link by email.
- Google and Apple both return verified emails, so auto-linking is safe.
- Phone-number plugin NOT listed in trustedProviders → stays isolated.
- After data migration (FR-017), Telegram users have `null` email → zero collision risk.

## Decision 4: Email Delivery via Resend

**Decision**: Use Resend SDK (`resend` npm package) inside the `sendMagicLink` callback.

**Rationale**: Per spec clarification, Resend was chosen. Modern TypeScript SDK, generous free tier (100 emails/day), excellent DX. Better Auth has no built-in email adapter — it's transport-agnostic by design.

**Alternatives considered**:
- AWS SES: Rejected per user choice — more complex setup.
- SendGrid: Rejected per user choice — Resend preferred for DX.

**Key details**:
- Install: `pnpm add resend`
- Requires verified domain in Resend dashboard (DNS records for `m5nita.app`).
- `sendMagicLink` callback receives `{ email, url, token }` — use `url` for the full link.
- Errors in `sendMagicLink` surface as API errors to client.

## Decision 5: Telegram Fake Email Cleanup

**Decision**: Remove `getTempEmail`/`getTempName` from phoneNumber plugin config and run data migration to null-ify existing fake emails.

**Rationale**: Per FR-016 and FR-017, fake emails (`{phone}@m5nita.app`) must be eliminated to prevent accidental account linking and keep identity spaces clean.

**Key details**:
- `getTempEmail` is **required** by Better Auth's phoneNumber plugin type — cannot be removed.
- Replace the `@m5nita.app` domain with an inert sentinel domain (`@phone.noemail.internal`) that will never match real emails. Combined with `emailVerified: false` and exclusion from `trustedProviders`, this prevents accidental account linking.
- No data migration needed — old `@m5nita.app` emails are equally inert (emailVerified=false + phone-number excluded from trustedProviders).

## New Dependencies

| Package | Purpose | Size impact |
|---------|---------|-------------|
| `resend` | Email delivery for magic links | ~15KB minified |
| `jose` | Apple JWT client secret generation | ~45KB minified (may already be a transitive dep) |

## Environment Variables (new)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `APPLE_CLIENT_ID` | Apple Services ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | Apple private key ID |
| `APPLE_PRIVATE_KEY` | Apple private key (PEM) |
| `RESEND_API_KEY` | Resend API key for sending emails |
