import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { OtpInput } from '../components/ui/OtpInput'
import { PhoneInput } from '../components/ui/PhoneInput'
import { authClient } from '../lib/auth'
import { consumePendingRedirect, redirectIfAuthenticated } from '../lib/authGuard'

const TELEGRAM_BOT_USERNAME = 'm5nita_bot'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="#26A5E4" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

function Separator() {
  return (
    <div className="flex items-center gap-4">
      <div className="h-px flex-1 bg-border" />
      <span className="font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
        ou
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

type LoginStep = 'main' | 'phone-otp' | 'magic-link-sent'

function LoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<LoginStep>('main')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<'google' | null>(null)
  const [error, setError] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const authError = params.get('error')
    if (authError) return 'Falha na autenticação. Tente novamente.'
    return ''
  })
  const [showTelegramHelp, setShowTelegramHelp] = useState(false)
  const [magicLinkCooldown, setMagicLinkCooldown] = useState(0)
  const verifyingRef = useRef(false)

  function handlePostLogin(userName?: string | null) {
    const pending = consumePendingRedirect()
    if (pending) {
      window.location.href = pending
    } else if (!userName || userName.startsWith('+')) {
      navigate({ to: '/complete-profile' })
    } else {
      navigate({ to: '/' })
    }
  }

  async function handleSocialSignIn(provider: 'google') {
    setSocialLoading(provider)
    setError('')
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: window.location.origin,
        errorCallbackURL: `${window.location.origin}/login?error=social`,
      })
    } catch {
      setError('Erro ao iniciar login. Tente novamente.')
      setSocialLoading(null)
    }
  }

  async function handleSendMagicLink() {
    if (!email || !email.includes('@')) {
      setError('Informe um email válido')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await authClient.signIn.magicLink({
        email,
        callbackURL: window.location.origin,
      })
      if (result.error) {
        if (result.error.message?.includes('TOO_MANY_REQUESTS')) {
          setError('Muitas tentativas. Aguarde alguns minutos.')
        } else {
          setError('Erro ao enviar link. Tente novamente.')
        }
        return
      }
      setStep('magic-link-sent')
      setMagicLinkCooldown(30)
      const interval = setInterval(() => {
        setMagicLinkCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch {
      setError('Erro ao enviar link. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendOtp() {
    if (phone.length < 13) {
      setError('Informe um telefone válido')
      return
    }
    setLoading(true)
    setError('')
    setShowTelegramHelp(false)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const checkRes = await fetch(`${apiUrl}/api/telegram/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      const { connected } = await checkRes.json()
      if (!connected) {
        setShowTelegramHelp(true)
        setError('Telefone não conectado ao Telegram')
        return
      }
      await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
      setStep('phone-otp')
    } catch {
      setError('Erro ao enviar código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(code?: string) {
    const otpCode = code || otp
    if (otpCode.length !== 6) {
      setError('Digite o código completo')
      return
    }
    if (verifyingRef.current) return
    verifyingRef.current = true
    setLoading(true)
    setError('')
    try {
      const result = await authClient.phoneNumber.verify({
        phoneNumber: phone,
        code: otpCode,
      })
      if (result.error) {
        setError('Código inválido ou expirado')
        return
      }
      handlePostLogin(result.data?.user?.name)
    } catch {
      setError('Erro ao verificar código.')
    } finally {
      setLoading(false)
      verifyingRef.current = false
    }
  }

  if (step === 'phone-otp') {
    return (
      <div className="flex min-h-[75vh] flex-col justify-center lg:items-center">
        <div className="lg:w-full lg:max-w-[480px] lg:border lg:border-border lg:p-10">
          <div className="mb-8">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
              m5nita
            </p>
            <h1 className="mt-1 font-display text-6xl font-black leading-[0.85] text-black">
              Código
            </h1>
            <div className="mt-3 h-1 w-12 bg-red" />
          </div>
          <div className="flex flex-col gap-6">
            <p className="text-sm text-gray-dark">
              Enviamos um código pelo Telegram para{' '}
              <span className="font-medium text-black">{phone}</span>
            </p>
            <OtpInput
              value={otp}
              onChange={setOtp}
              onComplete={handleVerifyOtp}
              error={error || undefined}
              disabled={loading}
            />
            <Button
              onClick={() => handleVerifyOtp()}
              loading={loading}
              className="w-full"
              size="lg"
            >
              Verificar
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('main')
                setOtp('')
                setError('')
              }}
              className="font-display text-xs font-bold uppercase tracking-wider text-gray-muted underline underline-offset-4 hover:text-black transition-colors cursor-pointer"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'magic-link-sent') {
    return (
      <div className="flex min-h-[75vh] flex-col justify-center lg:items-center">
        <div className="lg:w-full lg:max-w-[480px] lg:border lg:border-border lg:p-10">
          <div className="mb-8">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
              m5nita
            </p>
            <h1 className="mt-1 font-display text-6xl font-black leading-[0.85] text-black">
              Email enviado
            </h1>
            <div className="mt-3 h-1 w-12 bg-red" />
          </div>
          <div className="flex flex-col gap-6">
            <p className="text-sm text-gray-dark">
              Enviamos um link para <span className="font-medium text-black">{email}</span>.
              Verifique sua caixa de entrada.
            </p>
            {error && (
              <p className="text-xs font-medium text-red" role="alert">
                {error}
              </p>
            )}
            <Button
              onClick={handleSendMagicLink}
              loading={loading}
              disabled={magicLinkCooldown > 0}
              className="w-full"
              size="lg"
            >
              {magicLinkCooldown > 0 ? `Reenviar em ${magicLinkCooldown}s` : 'Reenviar link'}
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep('main')
                setError('')
              }}
              className="font-display text-xs font-bold uppercase tracking-wider text-gray-muted underline underline-offset-4 hover:text-black transition-colors cursor-pointer"
            >
              Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  const isSocialLoading = socialLoading !== null

  return (
    <div className="flex min-h-[75vh] flex-col justify-center lg:items-center">
      <div className="lg:w-full lg:max-w-[480px] lg:border lg:border-border lg:p-10">
        <div className="mb-8">
          <h1 className="mt-1 font-display text-6xl font-black leading-[0.85] text-black">
            Entrar
          </h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>

        <div className="flex flex-col gap-6">
          {/* Social Sign-In */}
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleSocialSignIn('google')}
              disabled={isSocialLoading}
              className="flex w-full items-center justify-center gap-3 border-2 border-black py-3.5 font-display text-sm font-bold uppercase tracking-wider text-black transition-all duration-150 hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 cursor-pointer"
            >
              {socialLoading === 'google' ? (
                <svg
                  className="h-5 w-5 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    className="opacity-75"
                  />
                </svg>
              ) : (
                <GoogleIcon />
              )}
              Continuar com Google
            </button>
          </div>

          <Separator />

          {/* Magic Link */}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMagicLink()
            }}
          >
            <Input
              label="Email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <Button
              type="submit"
              variant="secondary"
              loading={loading}
              disabled={isSocialLoading}
              className="w-full"
              size="lg"
            >
              <EmailIcon />
              Enviar link mágico
            </Button>
          </form>

          <Separator />

          {/* Telegram / Phone OTP */}
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              handleSendOtp()
            }}
          >
            <PhoneInput value={phone} onChange={setPhone} />
            {showTelegramHelp && (
              <div className="rounded-lg border border-gray-light bg-gray-lightest p-4">
                <p className="text-sm font-medium text-black">Conecte seu Telegram primeiro:</p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-dark">
                  <li>
                    Abra o bot{' '}
                    <a
                      href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=login`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-black underline underline-offset-2"
                    >
                      @{TELEGRAM_BOT_USERNAME}
                    </a>
                  </li>
                  <li>Toque em "Start"</li>
                  <li>Toque no botão "Compartilhar telefone"</li>
                  <li>Volte aqui e tente novamente</li>
                </ol>
              </div>
            )}
            <Button
              type="submit"
              variant="secondary"
              loading={loading}
              disabled={isSocialLoading}
              className="w-full"
              size="lg"
            >
              <TelegramIcon />
              Entrar com Telegram
            </Button>
          </form>

          {/* Error display */}
          {error && (
            <p className="text-xs font-medium text-red" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/login')({
  beforeLoad: () => redirectIfAuthenticated(),
  component: LoginPage,
})
