import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Loading } from '../components/ui/Loading'
import { apiFetch } from '../lib/api'
import { signOut, useSession } from '../lib/auth'

function SettingsPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
        setSaved(true)
        setName('')
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await signOut()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex flex-col gap-8">
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
          <div>
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
              Telefone
            </p>
            <p className="mt-1 border-b-2 border-border py-2.5 text-gray-muted">
              {session?.user?.phoneNumber || '—'}
            </p>
          </div>
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

      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
            Ajuda
          </h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex flex-col gap-3 text-sm text-gray-dark">
          <p>
            <strong className="text-black">Como funciona?</strong> Crie bolões, convide amigos,
            façam palpites e dispute o prêmio!
          </p>
          <p>
            <strong className="text-black">Pontuação:</strong> Exato = 10pts, Vencedor + diferença =
            7pts, Vencedor = 5pts, Empate = 3pts.
          </p>
          <p>
            <strong className="text-black">Prêmio:</strong> 1º lugar leva tudo (menos 5% taxa).
          </p>
        </div>
      </section>

      <Button variant="danger" onClick={handleLogout} className="w-full">
        Sair
      </Button>
      <p className="text-center font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
        m5nita v1.0.0
      </p>
    </div>
  )
}

export const Route = createFileRoute('/settings')({ component: SettingsPage })
