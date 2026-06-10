export const SCORING = {
  EXACT_MATCH: 10,
  WINNER_AND_WINNER_GOALS: 8,
  WINNER_AND_DIFF: 7,
  OUTCOME_CORRECT: 5,
  MISS: 0,
  /** Added when a member names the team that advances past regular time (extra time or penalties). */
  ADVANCE_BONUS: 2,
} as const

export const POOL = {
  MIN_ENTRY_FEE: 500,
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
  // Signed session snapshot cached in the cookie: skips the Postgres session
  // lookup on every authenticated request for this window. Short enough that a
  // revoked session stops working quickly.
  SESSION_COOKIE_CACHE_SECONDS: 300,
  MAGIC_LINK_EXPIRY_SECONDS: 900,
  MAGIC_LINK_RATE_LIMIT: 3,
  MAGIC_LINK_RATE_LIMIT_WINDOW_MS: 300_000,
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
    'league',
  ] as const,
  STATUSES: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'] as const,
  GROUPS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const,
  LIVE_POLL_INTERVAL_MS: 30_000,
} as const

export const PAYMENT = {
  PIX_TIMEOUT_SECONDS: 1800,
  STATUSES: ['pending', 'completed', 'refunded', 'expired'] as const,
  TYPES: ['entry', 'refund', 'prize', 'stats_unlock'] as const,
} as const

export const STATS = {
  // Symbolic one-time price to unlock a pool's statistics (centavos, BRL).
  // Configurable at the composition root via STATS_UNLOCK_PRICE_CENTAVOS.
  UNLOCK_PRICE_CENTAVOS_DEFAULT: 199,
  // Goal-volume band cutoff: a finished match with total goals <= this is "low".
  LOW_GOALS_MAX: 2,
} as const

export const COUPON = {
  MIN_CODE_LENGTH: 2,
  MAX_CODE_LENGTH: 20,
  CODE_REGEX: /^[A-Z0-9]+$/,
  MIN_DISCOUNT: 1,
  MAX_DISCOUNT: 100,
} as const

export const PREDICTION = {
  DEBOUNCE_MS: 500,
  MIN_SCORE: 0,
} as const

export const PIX = {
  KEY_TYPES: ['cpf', 'email', 'phone', 'random'] as const,
} as const

export const WITHDRAWAL = {
  STATUSES: ['pending', 'processing', 'completed', 'failed'] as const,
} as const

export const COMPETITION = {
  TYPES: ['cup', 'league'] as const,
  STATUSES: ['active', 'finished'] as const,
} as const
