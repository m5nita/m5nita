/**
 * Test-only in-memory sinks read by integration tests. Populated only when
 * NODE_ENV === 'test' (see sendOTP in lib/auth.ts). Production code paths
 * never import this module at runtime.
 */

export const testOtpInbox = new Map<string, string>()
