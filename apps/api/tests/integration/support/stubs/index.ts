import { setupServer } from 'msw/node'
import { footballDataStub } from './football-data-stub'
import { googleOAuthStub } from './google-oauth-stub'
import { infinitePayStub } from './infinitepay-stub'
import { resendStub } from './resend-stub'
import { telegramStub } from './telegram-stub'
import { turnstileStub } from './turnstile-stub'

export const mswServer = setupServer(
  ...turnstileStub.handlers,
  ...googleOAuthStub.handlers,
  ...resendStub.handlers,
  ...infinitePayStub.handlers,
  ...footballDataStub.handlers,
)

export function resetAllStubs() {
  turnstileStub.reset()
  googleOAuthStub.reset()
  resendStub.reset()
  infinitePayStub.reset()
  footballDataStub.reset()
  telegramStub.reset()
}

export {
  footballDataStub,
  googleOAuthStub,
  infinitePayStub,
  resendStub,
  telegramStub,
  turnstileStub,
}
