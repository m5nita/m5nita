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
    if (trimmed.length < 1) {
      setError('Informe seu nome')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Erro ao salvar nome')
        return
      }

      navigate({ to: '/' })
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="font-heading text-2xl font-bold text-navy">Bem-vindo ao Manita!</h1>
        <p className="mt-2 text-gray-dark">Como quer ser chamado?</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <Input
          label="Seu nome"
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
