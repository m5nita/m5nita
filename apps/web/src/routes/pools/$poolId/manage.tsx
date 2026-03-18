import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSession } from '../../../lib/auth'
import { apiFetch } from '../../../lib/api'
import { Button } from '../../../components/ui/Button'
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
      const res = await apiFetch(`/api/pools/${poolId}`)
      if (!res.ok) throw new Error('Bolão não encontrado')
      return res.json()
    },
  })

  const { data: membersData } = useQuery({
    queryKey: ['pool-members', poolId],
    queryFn: async () => {
      const res = await apiFetch(`/api/pools/${poolId}/members`)
      if (!res.ok) return { members: [] }
      return res.json()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; isOpen?: boolean }) => {
      const res = await apiFetch(`/api/pools/${poolId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pool', poolId] }),
  })

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await apiFetch(`/api/pools/${poolId}/members/${memberId}`, { method: 'DELETE' })
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
      const res = await apiFetch(`/api/pools/${poolId}/cancel`, { method: 'POST' })
      if (!res.ok) { const data = await res.json(); throw new Error(data.message || 'Erro ao encerrar') }
      return res.json()
    },
    onSuccess: () => navigate({ to: '/' }),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} />
  if (!pool) return null
  if (session?.user?.id !== pool.ownerId) return <ErrorMessage message="Apenas o criador pode gerenciar" />

  const members = membersData?.members ?? []

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">Admin</p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">Gerenciar</h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      {/* Edit name */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Nome do Bolão</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input label="" placeholder={pool.name} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={50} />
          </div>
          <Button size="sm" onClick={() => { if (editName.trim().length >= 3) { updateMutation.mutate({ name: editName.trim() }); setEditName('') } }} loading={updateMutation.isPending} disabled={editName.trim().length < 3}>
            Salvar
          </Button>
        </div>
      </section>

      {/* Toggle entries */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Novas Entradas</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-black">{pool.isOpen ? 'Aberto' : 'Bloqueado'}</p>
            <p className="text-xs text-gray-muted">{pool.isOpen ? 'Aceitando novas entradas' : 'Link de convite desabilitado'}</p>
          </div>
          <Button variant={pool.isOpen ? 'danger' : 'primary'} size="sm" onClick={() => updateMutation.mutate({ isOpen: !pool.isOpen })} loading={updateMutation.isPending}>
            {pool.isOpen ? 'Bloquear' : 'Liberar'}
          </Button>
        </div>
      </section>

      {/* Members */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">Participantes ({members.length})</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {members.length === 0 ? (
          <p className="text-sm text-gray-muted py-4">Nenhum participante</p>
        ) : (
          <div className="flex flex-col">
            {members.map((m: any, i: number) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border py-3">
                <div className="flex items-center gap-3">
                  <span className="font-display text-lg font-black text-gray-light">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <p className="font-display text-xs font-bold uppercase tracking-wide text-black">{m.name || 'Anônimo'}</p>
                    <p className="text-[10px] text-gray-muted">{new Date(m.joinedAt).toLocaleDateString('pt-BR')}</p>
                  </div>
                </div>
                {m.userId !== session?.user?.id && (
                  <Button variant="danger" size="sm" onClick={() => removeMutation.mutate(m.id)} loading={removeMutation.isPending}>
                    Remover
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-display text-xs font-bold uppercase tracking-widest text-red">Zona de Perigo</h2>
          <div className="h-px flex-1 bg-red/30" />
        </div>
        {!showCancel ? (
          <Button variant="danger" onClick={() => setShowCancel(true)} className="w-full">
            Encerrar Bolão (Reembolso Total)
          </Button>
        ) : (
          <div className="flex flex-col gap-3 border-l-4 border-red bg-red/5 p-4">
            <p className="text-sm text-gray-dark">Todos os participantes serão reembolsados e o bolão será cancelado permanentemente.</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending} className="flex-1">
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setShowCancel(false)} className="flex-1">
                Cancelar
              </Button>
            </div>
            {cancelMutation.error && <p className="text-xs font-medium text-red">{cancelMutation.error.message}</p>}
          </div>
        )}
      </section>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/manage')({ component: ManagePage })
