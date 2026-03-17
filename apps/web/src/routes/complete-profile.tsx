import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

function CompleteProfilePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    const trimmed = name.trim()
    if (trimmed.length < 1) { setError('Informe seu nome'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) { const data = await res.json(); setError(data.message || 'Erro ao salvar'); return }
      navigate({ to: '/' })
    } catch {
      setError('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[75vh] flex-col justify-center">
      <div className="mb-8">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Primeiro acesso</p>
        <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">
          Seu Nome
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
        <p className="mt-4 text-sm text-gray-dark">Como quer ser chamado no Manita?</p>
      </div>

      <div className="flex flex-col gap-6">
        <Input
          label="Nome"
          placeholder="Ex: Igor"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error || undefined}
          autoFocus
        />
        <Button onClick={handleSubmit} loading={loading} className="w-full" size="lg">
          Continuar
        </Button>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/complete-profile')({
  component: CompleteProfilePage,
})
