import { betterAuth } from 'better-auth'
import { phoneNumber } from 'better-auth/plugins/phone-number'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import twilio from 'twilio'
import { db } from '../db/client'
import { AUTH } from '@m5nita/shared'

export const auth = betterAuth({
  basePath: '/api/auth',
  database: drizzleAdapter(db, { provider: 'pg' }),
  trustedOrigins: [process.env.ALLOWED_ORIGIN || 'http://localhost:5173'],
  session: {
    expiresIn: AUTH.SESSION_EXPIRY_SECONDS,
    updateAge: AUTH.SESSION_UPDATE_AGE_SECONDS,
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[DEV] OTP for ${phone}: ${code}`)
          return
        }
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
          to: `whatsapp:${phone}`,
          body: `Seu código M5nita: ${code}`,
        })
      },
      otpLength: AUTH.OTP_LENGTH,
      expiresIn: AUTH.OTP_EXPIRY_SECONDS,
      signUpOnVerification: {
        getTempEmail: (phoneNumber) => `${phoneNumber.replace('+', '')}@m5nita.app`,
        getTempName: (phoneNumber) => phoneNumber,
      },
    }),
  ],
})
