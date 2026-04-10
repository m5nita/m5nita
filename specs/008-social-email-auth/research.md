# Research: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

## Decision 1: Social Provider (Google)

**Decision**: Use Better Auth's built-in `socialProviders` config — no extra plugins needed.

**Rationale**: Google OAuth is a first-class citizen in Better Auth core. Server-side config is minimal (`clientId` + `clientSecret` in `socialProviders.google`). Client-side uses `authClient.signIn.social({ provider: "google" })`. No additional packages required.

**Alternatives considered**:
- Manual OAuth2 implementation: Rejected — would duplicate what Better Auth already provides.
- Passport.js / next-auth: Rejected — different auth framework, incompatible with existing Better Auth setup.

**Key details**:
- Callback URL auto-registered at `/api/auth/callback/google`.
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

**Decision**: Use Better Auth's built-in `account.accountLinking` config with `trustedProviders: ["google", "magic-link"]`.

**Rationale**: Auto-links accounts by verified email across email-based providers. Phone-number (Telegram) accounts naturally stay isolated because of the sentinel email domain — no collision possible.

**Alternatives considered**:
- Manual account linking logic: Rejected — Better Auth handles this natively.
- Include phone-number in trustedProviders: Rejected — Telegram and email-based providers are separate identity spaces per spec clarification.

**Key details**:
- `trustedProviders` array controls which providers can auto-link by email.
- Google returns verified emails, so auto-linking is safe.
- Phone-number plugin NOT listed in trustedProviders → stays isolated.
- Telegram users use a sentinel `@phone.noemail.internal` email → zero collision risk with real provider emails.

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

## Decision 5: Telegram Sentinel Email

**Decision**: Replace `@m5nita.app` fake email domain with inert sentinel domain `@phone.noemail.internal` in the phoneNumber plugin config.

**Rationale**: Per FR-008, fake emails must not accidentally match real user emails from social/magic-link providers.

**Key details**:
- `getTempEmail` is **required** by Better Auth's phoneNumber plugin type — cannot be removed.
- Use a non-routable sentinel domain that will never match real emails. Combined with `emailVerified: false` and exclusion from `trustedProviders`, this prevents accidental account linking.
- No data migration needed — old `@m5nita.app` emails are equally inert (emailVerified=false + phone-number excluded from trustedProviders).

## New Dependencies

| Package | Purpose | Size impact |
|---------|---------|-------------|
| `resend` | Email delivery for magic links | ~15KB minified |

## Environment Variables (new)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `RESEND_API_KEY` | Resend API key for sending emails |
