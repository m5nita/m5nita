import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Loading } from '../components/ui/Loading'
import { PhoneInput } from '../components/ui/PhoneInput'
import { apiFetch } from '../lib/api'
import { signOut, useSession } from '../lib/auth'
import { requireAuthGuard } from '../lib/authGuard'

const TELEGRAM_BOT_USERNAME = 'm5nita_bot'

function TelegramConnectInstructions() {
  return (
    <div className="rounded-lg border-2 border-black/10 bg-gray-lightest p-4">
      <p className="text-sm font-medium text-black">Conecte seu Telegram:</p>
      <ol className="mt-3 list-inside list-decimal space-y-1 text-xs text-gray-dark">
        <li>
          Abra o bot{' '}
          <a
            href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=connect`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-black underline underline-offset-2"
          >
            @{TELEGRAM_BOT_USERNAME}
          </a>
        </li>
        <li>Toque em "Start"</li>
        <li>Toque no botão "Compartilhar telefone"</li>
      </ol>
    </div>
  )
}

function SettingsPage() {
  const navigate = useNavigate()
  const { data: session, isPending, refetch } = useSession()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [phone, setPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  const phoneNumber = session?.user?.phoneNumber
  const hasPhone = !!phoneNumber

  const { data: telegramStatus } = useQuery({
    queryKey: ['telegram-connected', phoneNumber],
    queryFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const res = await fetch(`${apiUrl}/api/telegram/check-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber }),
      })
      return res.json() as Promise<{ connected: boolean }>
    },
    enabled: hasPhone,
  })

  const telegramConnected = telegramStatus?.connected ?? false
  const queryClient = useQueryClient()

  if (isPending) return <Loading />

  async function handleSaveName() {
    if (name.trim().length < 1) return
    setSaving(true)
    try {
      const res = await apiFetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.ok) {
        await refetch()
        setSaved(true)
        setName('')
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleSavePhone() {
    if (phone.length < 13) {
      setPhoneError('Informe um telefone válido')
      return
    }
    setSavingPhone(true)
    setPhoneError('')
    try {
      const res = await apiFetch('/api/users/me/phone', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      if (!res.ok) {
        const data = await res.json()
        setPhoneError(data.message || 'Erro ao salvar telefone')
        return
      }
      await refetch()
    } catch {
      setPhoneError('Erro ao salvar telefone')
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleLogout() {
    await signOut()
    queryClient.clear()
    navigate({ to: '/login' })
  }

  // Notification section states:
  // 1. No phone → show phone input
  // 2. Has phone, not connected to Telegram → show bot instructions
  // 3. Has phone, connected to Telegram → hide section
  const showNotificationSection = !hasPhone || (hasPhone && !telegramConnected)

  return (
    <div className="flex flex-col gap-8 lg:items-center">
      <div className="lg:w-full lg:max-w-[520px] lg:border lg:border-border  lg:p-10 flex flex-col gap-8">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Conta
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Config</h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>

        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Perfil
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-4">
            {hasPhone && (
              <div>
                <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
                  Telefone
                </p>
                <p className="mt-1 border-b-2 border-border py-2.5 text-gray-muted">
                  {phoneNumber}
                </p>
              </div>
            )}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="Nome"
                  placeholder={session?.user?.name || 'Seu nome'}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <Button
                onClick={handleSaveName}
                loading={saving}
                disabled={name.trim().length < 1}
                size="sm"
              >
                {saved ? 'Salvo!' : 'Salvar'}
              </Button>
            </div>
          </div>
        </section>

        {showNotificationSection && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
                Notificações
              </h2>
              <div className="h-px flex-1 bg-border" />
            </div>
            {hasPhone ? (
              <TelegramConnectInstructions />
            ) : (
              <div className="flex flex-col gap-4">
                <p className="text-xs text-gray-dark leading-relaxed">
                  Informe seu telefone e conecte ao Telegram para receber lembretes de palpites e
                  resultados.
                </p>
                <PhoneInput value={phone} onChange={setPhone} />
                {phoneError && (
                  <p className="text-xs font-medium text-red" role="alert">
                    {phoneError}
                  </p>
                )}
                <Button
                  onClick={handleSavePhone}
                  loading={savingPhone}
                  disabled={phone.length < 13}
                  size="lg"
                  className="w-full"
                >
                  Salvar telefone
                </Button>
              </div>
            )}
          </section>
        )}

        <Button variant="danger" onClick={handleLogout} className="w-full">
          Sair
        </Button>
        <p className="text-center font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
          m5nita {__APP_VERSION__}
        </p>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({
  beforeLoad: () => requireAuthGuard(),
  component: SettingsPage,
})
