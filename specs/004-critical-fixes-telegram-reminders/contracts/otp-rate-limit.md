# Contract: OTP Rate Limit Response

## Endpoint

`POST /api/auth/phone-number/send-otp`

## New Behavior

When rate limit is exceeded (> 3 requests per 5 minutes for same phone number):

**Status**: `429 Too Many Requests`

**Response Body**:
```json
{
  "error": "TOO_MANY_REQUESTS",
  "message": "Tente novamente em alguns minutos"
}
```

## Unchanged Behavior

Normal OTP flow (within rate limit) continues to be handled by Better Auth phone-number plugin with no changes to request/response format.
