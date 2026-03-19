export const SCORING = {
  EXACT_MATCH: 10,
  WINNER_AND_DIFF: 7,
  WINNER_CORRECT: 5,
  DRAW_CORRECT: 3,
  MISS: 0,
} as const

export const POOL = {
  MIN_ENTRY_FEE: 100,
  MAX_ENTRY_FEE: 100000,
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 50,
  PLATFORM_FEE_RATE: 0.05,
  INVITE_CODE_LENGTH: 8,
  QUICK_SELECT_VALUES: [2000, 5000, 10000, 20000],
} as const

export const AUTH = {
  OTP_EXPIRY_SECONDS: 300,
  OTP_LENGTH: 6,
  OTP_RATE_LIMIT: 3,
  OTP_RATE_LIMIT_WINDOW_SECONDS: 300,
  SESSION_EXPIRY_SECONDS: 60 * 60 * 24 * 90,
  SESSION_UPDATE_AGE_SECONDS: 60 * 60 * 24,
} as const

export const MATCH = {
  STAGES: [
    'group',
    'round-of-32',
    'round-of-16',
    'quarter',
    'semi',
    'third-place',
    'final',
  ] as const,
  STATUSES: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'] as const,
  GROUPS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const,
  LIVE_POLL_INTERVAL_MS: 30_000,
} as const

export const PAYMENT = {
  PIX_TIMEOUT_SECONDS: 1800,
  STATUSES: ['pending', 'completed', 'refunded', 'expired'] as const,
  TYPES: ['entry', 'refund', 'prize'] as const,
} as const

export const PREDICTION = {
  DEBOUNCE_MS: 500,
  MIN_SCORE: 0,
} as const
