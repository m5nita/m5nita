import { betterAuth } from 'better-auth'
import { phoneNumber } from 'better-auth/plugins/phone-number'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '../db/client'
import { AUTH } from '@manita/shared'

export const auth = betterAuth({
  basePath: '/api/auth',
  database: drizzleAdapter(db, { provider: 'pg' }),
  session: {
    expiresIn: AUTH.SESSION_EXPIRY_SECONDS,
    updateAge: AUTH.SESSION_UPDATE_AGE_SECONDS,
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] OTP for ${phone}: ${code}`)
        } else {
          throw new Error('Twilio integration not configured for production')
        }
      },
      otpLength: AUTH.OTP_LENGTH,
      expiresIn: AUTH.OTP_EXPIRY_SECONDS,
      signUpOnVerification: {
        getTempEmail: (phoneNumber) => `${phoneNumber.replace('+', '')}@manita.app`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
  ],
})
