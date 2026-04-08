import { AUTH } from '@m5nita/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { phoneNumber } from 'better-auth/plugins/phone-number'
import { db } from '../db/client'
import { sendMagicLinkEmail } from './resend'
import { findChatIdByPhone, sendOtpViaTelegram } from './telegram'

const magicLinkRateLimit = new Map<string, { count: number; resetAt: number }>()

export const auth = betterAuth({
  basePath: '/api/auth',
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg' }),
  trustedOrigins: [process.env.ALLOWED_ORIGIN || 'http://localhost:5173'],
  session: {
    expiresIn: AUTH.SESSION_EXPIRY_SECONDS,
    updateAge: AUTH.SESSION_UPDATE_AGE_SECONDS,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'magic-link'],
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] OTP for ${phone}: ${code}`)
          return
        }
        const chatId = await findChatIdByPhone(phone)
        if (!chatId) {
          throw new Error('TELEGRAM_NOT_CONNECTED')
        }
        await sendOtpViaTelegram(chatId, code)
      },
      otpLength: AUTH.OTP_LENGTH,
      expiresIn: AUTH.OTP_EXPIRY_SECONDS,
      signUpOnVerification: {
        getTempEmail: (phoneNumber) => `${phoneNumber.replace('+', '')}@phone.noemail.internal`,
      },
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const now = Date.now()
        const entry = magicLinkRateLimit.get(email)
        if (entry && now < entry.resetAt && entry.count >= AUTH.MAGIC_LINK_RATE_LIMIT) {
          throw new Error('TOO_MANY_REQUESTS')
        }
        if (!entry || now >= entry.resetAt) {
          magicLinkRateLimit.set(email, {
            count: 1,
            resetAt: now + AUTH.MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
          })
        } else {
          entry.count++
        }

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] Magic link for ${email}: ${url}`)
          return
        }
        await sendMagicLinkEmail(email, url)
      },
      expiresIn: AUTH.MAGIC_LINK_EXPIRY_SECONDS,
      allowedAttempts: AUTH.MAGIC_LINK_ALLOWED_ATTEMPTS,
    }),
  ],
})
