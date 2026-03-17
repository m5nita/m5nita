import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth'
import { consumePendingRedirect } from '../lib/authGuard'
import { PhoneInput } from '../components/ui/PhoneInput'
import { OtpInput } from '../components/ui/OtpInput'
import { Button } from '../components/ui/Button'

function LoginPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSendOtp() {
    if (phone.length < 13) {
      setError('Informe um telefone válido')
      return
    }
    setLoading(true)
    setError('')
    try {
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
      } else if (!result.data?.user?.name) {
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
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Manita</p>
        <h1 className="mt-1 font-display text-6xl font-black leading-[0.85] text-black">
          {step === 'phone' ? 'Entrar' : 'Código'}
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {step === 'phone' ? (
        <div className="flex flex-col gap-6">
          <PhoneInput value={phone} onChange={setPhone} />
          {error && <p className="text-xs font-medium text-red" role="alert">{error}</p>}
          <Button onClick={handleSendOtp} loading={loading} className="w-full" size="lg">
            Enviar código via WhatsApp
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-gray-dark">
            Enviamos um código para <span className="font-medium text-black">{phone}</span>
          </p>
          <OtpInput value={otp} onChange={setOtp} error={error || undefined} disabled={loading} />
          <Button onClick={handleVerifyOtp} loading={loading} className="w-full" size="lg">
            Verificar
          </Button>
          <button
            type="button"
            onClick={() => { setStep('phone'); setOtp(''); setError('') }}
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
