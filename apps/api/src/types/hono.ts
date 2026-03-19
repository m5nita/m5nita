import type { auth } from '../lib/auth'

type Session = typeof auth.$Infer.Session

export type AppEnv = {
  Variables: {
    user: Session['user']
    session: Session['session']
  }
}
