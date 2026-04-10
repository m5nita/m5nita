# Quickstart: Social Sign-On & Email Magic Link Authentication

**Feature Branch**: `008-social-email-auth`  
**Date**: 2026-04-08

## Prerequisites

### 1. Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`
4. Copy Client ID and Client Secret

### 2. Resend Account

1. Sign up at [resend.com](https://resend.com)
2. Add and verify domain `m5nita.app` (DNS records)
3. Create an API key

## Environment Variables

Add to `apps/api/.env`:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Resend (email)
RESEND_API_KEY=re_xxxxxxxxxxxx
```

## New Dependencies

```bash
pnpm add resend --filter @m5nita/api
```

## Development Testing

### Google OAuth
- Works with `localhost` redirect URIs in Google Cloud Console
- Add `http://localhost:3001/api/auth/callback/google` as authorized redirect

### Magic Link (Resend)
- Resend works immediately with API key
- For development, you can send to any email from the verified domain
- Check Resend dashboard for delivery logs

## Quick Verification

After setup, verify each method works:

1. **Google**: Click "Continue with Google" → Google consent screen → redirected back with session
2. **Magic Link**: Enter email → check inbox → click link → redirected back with session
3. **Telegram**: Existing flow should still work unchanged
