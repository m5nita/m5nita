import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { ErrorMessage } from '../../../components/ui/ErrorMessage'
import { Input } from '../../../components/ui/Input'
import { Loading } from '../../../components/ui/Loading'
import { apiFetch } from '../../../lib/api'
import { useSession } from '../../../lib/auth'

function ManagePage() {
  const { poolId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const [editName, setEditName] = useState('')

  const {
    data: pool,
    isPending,
    error,
  } = useQuery({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const res = await apiFetch(`/api/pools/${poolId}`)
      if (!res.ok) throw new Error('Bolão não encontrado')
      return res.json()
    },
  })

  const { data: membersData } = useQuery({
    queryKey: ['pool-members', poolId],
    queryFn: async (): Promise<{
      members: { id: string; userId: string; name: string | null; joinedAt: string }[]
    }> => {
      const res = await apiFetch(`/api/pools/${poolId}/members`)
      if (!res.ok) return { members: [] }
      return res.json()
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; isOpen?: boolean }) => {
      const res = await apiFetch(`/api/pools/${poolId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      return res.json()
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pool', poolId] }),
  })

  if (isPending) return <Loading />
  if (error) return <ErrorMessage message={error.message} />
  if (!pool) return null
  if (session?.user?.id !== pool.ownerId)
    return <ErrorMessage message="Apenas o criador pode gerenciar" />

  const members = membersData?.members ?? []

  return (
    <div className="flex flex-col gap-8 lg:items-center">
      <div className="lg:w-full lg:max-w-[520px] lg:border lg:border-border lg:p-10 flex flex-col gap-8">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Admin
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
            Gerenciar
          </h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>

        {/* Edit name */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Nome do Bolão
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                label=""
                placeholder={pool.name}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
              />
            </div>
            <Button
              size="sm"
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
        </section>

        {/* Toggle entries */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Novas Entradas
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-black">
                {pool.isOpen ? 'Aberto' : 'Bloqueado'}
              </p>
              <p className="text-xs text-gray-muted">
                {pool.isOpen ? 'Aceitando novas entradas' : 'Link de convite desabilitado'}
              </p>
            </div>
            <Button
              variant={pool.isOpen ? 'danger' : 'primary'}
              size="sm"
              onClick={() => updateMutation.mutate({ isOpen: !pool.isOpen })}
              loading={updateMutation.isPending}
            >
              {pool.isOpen ? 'Bloquear' : 'Liberar'}
            </Button>
          </div>
        </section>

        {/* Members */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Participantes ({members.length})
            </h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-gray-muted py-4">Nenhum participante</p>
          ) : (
            <div className="flex flex-col">
              {members.map((m, i) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between border-b border-border py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-display text-lg font-black text-gray-light">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wide text-black">
                        {m.name || 'Anônimo'}
                      </p>
                      <p className="text-[10px] text-gray-muted">
                        {new Date(m.joinedAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/pools/$poolId/manage')({ component: ManagePage })
