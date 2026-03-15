import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useSession, signOut } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Loading } from '../components/ui/Loading'

function SettingsPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [notifications, setNotifications] = useState(() => {
    return localStorage.getItem('manita_notifications') !== 'off'
  })

  if (isPending) return <Loading />

  async function handleSaveName() {
    if (name.trim().length < 1) return
    setSaving(true)
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  function toggleNotifications() {
    const next = !notifications
    setNotifications(next)
    localStorage.setItem('manita_notifications', next ? 'on' : 'off')
  }

  async function handleLogout() {
    await signOut()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold text-navy">Configuracoes</h1>

      <Card>
        <h2 className="mb-3 font-heading font-bold text-navy">Perfil</h2>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-navy">Telefone</label>
            <p className="mt-1 rounded-lg bg-navy/5 px-4 py-2.5 text-navy/60">
              {session?.user?.phoneNumber || '—'}
            </p>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label="Nome"
                placeholder={session?.user?.name || 'Seu nome'}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button onClick={handleSaveName} loading={saving} disabled={name.trim().length < 1}>
              {saved ? 'Salvo!' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold text-navy">Notificacoes</h2>
            <p className="text-sm text-gray-dark">Receber alertas sobre jogos e resultados</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={notifications}
            onClick={toggleNotifications}
            className={`relative h-6 w-11 rounded-full transition-colors ${notifications ? 'bg-green' : 'bg-navy/20'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifications ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 font-heading font-bold text-navy">Ajuda</h2>
        <div className="flex flex-col gap-2 text-sm text-gray-dark">
          <p><strong>Como funciona?</strong> Crie um bolao, convide amigos, facam palpites nos jogos da Copa 2026 e dispute o premio!</p>
          <p><strong>Pontuacao:</strong> Placar exato = 10pts, Vencedor + diferenca = 7pts, Vencedor = 5pts, Empate = 3pts.</p>
          <p><strong>Premio:</strong> O 1o lugar leva tudo (menos 5% de taxa).</p>
          <p><strong>Pagamento:</strong> Via Pix ou cartao de credito.</p>
        </div>
      </Card>

      <Button variant="danger" onClick={handleLogout} className="w-full">
        Sair
      </Button>

      <p className="text-center text-xs text-gray">Manita v1.0.0</p>
    </div>
  )
}

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})
