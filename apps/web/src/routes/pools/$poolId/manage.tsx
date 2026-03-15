import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSession } from '../../../lib/auth'
import { formatCurrency } from '../../../lib/utils'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { Input } from '../../../components/ui/Input'
import { Loading } from '../../../components/ui/Loading'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'

function ManagePage() {
  const { poolId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [editName, setEditName] = useState('')
  const [showCancel, setShowCancel] = useState(false)

  const { data: pool, isPending, error } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Bolao nao encontrado')
      return res.json()
    },
  })

  const { data: membersData } = useQuery({
    queryKey: ['pool-members', poolId],
    queryFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/members`, { credentials: 'include' })
      if (!res.ok) return { members: [] }
      return res.json()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; isOpen?: boolean }) => {
      const res = await fetch(`/api/pools/${poolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pool', poolId] }),
  })

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/pools/${poolId}/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao remover')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool-members', poolId] })
      queryClient.invalidateQueries({ queryKey: ['pool', poolId] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/pools/${poolId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro ao encerrar')
      }
      return res.json()
    },
    onSuccess: () => navigate({ to: '/' }),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} />
  if (!pool) return null
  if (session?.user?.id !== pool.ownerId) {
    return <ErrorMessage message="Apenas o criador pode gerenciar o bolao" />
  }

  const members = membersData?.members ?? []

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-bold text-navy">Gerenciar bolao</h1>

      <Card>
        <h2 className="mb-3 font-heading font-bold text-navy">Editar nome</h2>
        <div className="flex gap-2">
          <Input
            label=""
            placeholder={pool.name}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={50}
          />
          <Button
            onClick={() => {
              if (editName.trim().length >= 3) {
                updateMutation.mutate({ name: editName.trim() })
                setEditName('')
              }
            }}
            loading={updateMutation.isPending}
            disabled={editName.trim().length < 3}
          >
            Salvar
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-navy">Novas entradas</h2>
          <Button
            variant={pool.isOpen ? 'danger' : 'primary'}
            size="sm"
            onClick={() => updateMutation.mutate({ isOpen: !pool.isOpen })}
            loading={updateMutation.isPending}
          >
            {pool.isOpen ? 'Bloquear' : 'Liberar'}
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-dark">
          {pool.isOpen ? 'O bolao aceita novas entradas.' : 'Novas entradas estao bloqueadas.'}
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 font-heading font-bold text-navy">
          Participantes ({members.length})
        </h2>
        {members.length === 0 ? (
          <p className="text-sm text-gray-dark">Nenhum participante.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg bg-navy/[0.02] px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-navy">{m.name || 'Anonimo'}</p>
                  <p className="text-xs text-gray">{new Date(m.joinedAt).toLocaleDateString('pt-BR')}</p>
                </div>
                {m.userId !== session?.user?.id && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => removeMutation.mutate(m.id)}
                    loading={removeMutation.isPending}
                  >
                    Remover
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-red/20 bg-red/5">
        <h2 className="mb-2 font-heading font-bold text-red">Zona de perigo</h2>
        {!showCancel ? (
          <Button variant="danger" onClick={() => setShowCancel(true)} className="w-full">
            Encerrar bolao (reembolso total)
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-red">
              Tem certeza? Todos os participantes serao reembolsados e o bolao sera cancelado.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending} className="flex-1">
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setShowCancel(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
            {cancelMutation.error && (
              <p className="text-sm text-red">{cancelMutation.error.message}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/manage')({
  component: ManagePage,
})
