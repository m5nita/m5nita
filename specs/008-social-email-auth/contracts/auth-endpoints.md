# Auth API Contracts: Social Sign-On & Email Magic Link

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

All endpoints are auto-managed by Better Auth under `/api/auth/*`. No custom routes needed.

## New Endpoints (auto-registered by Better Auth)

### Social Sign-In

#### `POST /api/auth/sign-in/social`

Initiates OAuth flow for Google or Apple.

**Request**:
```json
{
  "provider": "google" | "apple",
  "callbackURL": "/",
  "errorCallbackURL": "/login"
}
```

**Response**: `302 Redirect` to provider's consent screen.

**Callback** (auto-handled):
- `GET /api/auth/callback/google` — Google OAuth callback
- `POST /api/auth/callback/apple` — Apple Sign-In callback (form_post)

After callback, user is redirected to `callbackURL` with active session cookie.

---

### Magic Link

#### `POST /api/auth/sign-in/magic-link`

Sends a magic link email to the specified address.

**Request**:
```json
{
  "email": "user@example.com",
  "callbackURL": "/"
}
```

**Response (success)**:
```json
{
  "status": true
}
```

**Response (rate limited)**:
```json
{
  "status": false,
  "error": "TOO_MANY_REQUESTS"
}
```

#### `GET /api/auth/magic-link/verify`

Verifies the magic link token (user clicks link in email).

**Query params**: `?token=xxx&callbackURL=/`

**Response**: `302 Redirect` to `callbackURL` with active session cookie, or error page if token expired/invalid.

---

## Existing Endpoints (unchanged)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/phone-number/send-otp` | Send Telegram OTP |
| `POST /api/auth/phone-number/verify` | Verify Telegram OTP |
| `GET /api/auth/get-session` | Get current session |
| `POST /api/auth/sign-out` | Sign out |

## Client-Side API

```typescript
// Social sign-in (Google/Apple)
authClient.signIn.social({ provider: "google", callbackURL: "/" });
authClient.signIn.social({ provider: "apple", callbackURL: "/" });

// Magic link
authClient.signIn.magicLink({ email: "user@example.com", callbackURL: "/" });

// Existing (unchanged)
authClient.phoneNumber.sendOtp({ phoneNumber: "+5511999999999" });
authClient.phoneNumber.verify({ phoneNumber: "+5511999999999", code: "123456" });
authClient.useSession();
authClient.signOut();
```
