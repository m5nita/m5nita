import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { OtpInput } from '../components/ui/OtpInput'
import { PhoneInput } from '../components/ui/PhoneInput'
import { authClient } from '../lib/auth'
import { consumePendingRedirect } from '../lib/authGuard'

const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'm5nita_bot'

function LoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTelegramHelp, setShowTelegramHelp] = useState(false)

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
      setStep('otp')
    } catch {
      setError('Erro ao enviar código. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError('Digite o código completo')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await authClient.phoneNumber.verify({
        phoneNumber: phone,
        code: otp,
      })
      if (result.error) {
        setError('Código inválido ou expirado')
        return
      }
      const pending = consumePendingRedirect()
      if (pending) {
        window.location.href = pending
      } else if (!result.data?.user?.name || result.data.user.name.startsWith('+')) {
        navigate({ to: '/complete-profile' })
      } else {
        navigate({ to: '/' })
      }
    } catch {
      setError('Erro ao verificar código.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[75vh] flex-col justify-center">
      <div className="mb-8">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          m5nita
        </p>
        <h1 className="mt-1 font-display text-6xl font-black leading-[0.85] text-black">
          {step === 'phone' ? 'Entrar' : 'Código'}
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {step === 'phone' ? (
        <div className="flex flex-col gap-6">
          <PhoneInput value={phone} onChange={setPhone} />
          {error && (
            <p className="text-xs font-medium text-red" role="alert">
              {error}
            </p>
          )}
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
                <li>Compartilhe seu número de telefone</li>
                <li>Volte aqui e tente novamente</li>
              </ol>
            </div>
          )}
          <Button onClick={handleSendOtp} loading={loading} className="w-full" size="lg">
            Enviar código
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-gray-dark">
            Enviamos um código pelo Telegram para{' '}
            <span className="font-medium text-black">{phone}</span>
          </p>
          <OtpInput value={otp} onChange={setOtp} error={error || undefined} disabled={loading} />
          <Button onClick={handleVerifyOtp} loading={loading} className="w-full" size="lg">
            Verificar
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep('phone')
              setOtp('')
              setError('')
            }}
            className="font-display text-xs font-bold uppercase tracking-wider text-gray-muted underline underline-offset-4 hover:text-black transition-colors cursor-pointer"
          >
            Usar outro número
          </button>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
})
