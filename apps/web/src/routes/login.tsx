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
      setError('Informe um telefone valido')
      return
    }

    setLoading(true)
    setError('')

    try {
      await authClient.phoneNumber.sendOtp({ phoneNumber: phone })
      setStep('otp')
    } catch {
      setError('Erro ao enviar codigo. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setError('Digite o codigo completo de 6 digitos')
      return
    }

    setLoading(true)
    setError('')

    try {
      const result = await authClient.phoneNumber.verifyOtp({
        phoneNumber: phone,
        code: otp,
      })

      if (result.error) {
        setError('Codigo invalido ou expirado')
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
      setError('Erro ao verificar codigo. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="font-heading text-4xl font-bold text-navy">Manita</h1>
        <p className="mt-2 text-gray-dark">Bolao da Copa do Mundo 2026</p>
      </div>

      <div className="w-full max-w-sm">
        {step === 'phone' ? (
          <div className="flex flex-col gap-6">
            <PhoneInput value={phone} onChange={setPhone} error={error ? undefined : undefined} />

            {error && (
              <p className="text-sm text-red" role="alert">
                {error}
              </p>
            )}

            <Button onClick={handleSendOtp} loading={loading} className="w-full" size="lg">
              Enviar codigo via WhatsApp
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-center text-sm text-gray-dark">
              Enviamos um codigo de 6 digitos para{' '}
              <span className="font-medium text-navy">{phone}</span>
            </p>

            <OtpInput value={otp} onChange={setOtp} error={error || undefined} disabled={loading} />

            <Button onClick={handleVerifyOtp} loading={loading} className="w-full" size="lg">
              Verificar codigo
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep('phone')
                setOtp('')
                setError('')
              }}
              className="text-center text-sm text-gray-dark underline hover:text-navy"
            >
              Usar outro numero
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/login')({
  component: LoginPage,
})
