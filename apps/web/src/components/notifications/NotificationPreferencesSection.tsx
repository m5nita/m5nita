import type { NotificationPreferencesResponse, NotificationTypeView } from '@m5nita/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'

const QUERY_KEY = ['notification-preferences']

function Switch({
  type,
  busy,
  onToggle,
}: {
  type: NotificationTypeView
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={type.enabled}
      aria-label={type.label}
      disabled={busy}
      onClick={() => onToggle(!type.enabled)}
      className={`relative h-6 w-11 flex-shrink-0 border-2 transition-colors cursor-pointer disabled:cursor-wait ${
        type.enabled ? 'border-black bg-black' : 'border-border bg-transparent'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-4 w-4 transition-[left] ${
          type.enabled ? 'left-[22px] bg-white' : 'left-0.5 bg-border'
        }`}
      />
    </button>
  )
}

function PreferenceRow({
  type,
  busy,
  onToggle,
}: {
  type: NotificationTypeView
  busy: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-display text-xs font-bold uppercase tracking-wide text-black">
          {type.label}
        </p>
        <p className="text-xs leading-relaxed text-gray-muted">{type.description}</p>
      </div>
      {type.optOutable ? (
        <Switch type={type} busy={busy} onToggle={onToggle} />
      ) : (
        <span className="flex-shrink-0 border-2 border-border px-2 py-1 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
          Sempre ativo
        </span>
      )}
    </div>
  )
}

/**
 * Account-level control over what the app sends, as opposed to the per-device
 * push toggle. Renders whatever the catalog currently holds, so a new
 * notification type needs no change here.
 */
export function NotificationPreferencesSection() {
  const queryClient = useQueryClient()

  const { data, isPending, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<NotificationPreferencesResponse> => {
      const res = await apiFetch('/api/notification-preferences')
      if (!res.ok) throw new Error('Não foi possível carregar suas preferências')
      return res.json()
    },
  })

  const mutation = useMutation({
    mutationFn: async (input: { code: string; enabled: boolean }) => {
      const res = await apiFetch('/api/notification-preferences', {
        method: 'PATCH',
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Não foi possível salvar. Tente de novo.')
      return (await res.json()) as NotificationPreferencesResponse
    },
    // Optimistic: the switch must move immediately. The server's list replaces
    // the guess on success, and the snapshot is restored on failure.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const previous = queryClient.getQueryData<NotificationPreferencesResponse>(QUERY_KEY)
      queryClient.setQueryData<NotificationPreferencesResponse>(QUERY_KEY, (current) =>
        current
          ? {
              types: current.types.map((type) =>
                type.code === input.code ? { ...type, enabled: input.enabled } : type,
              ),
            }
          : current,
      )
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous)
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(QUERY_KEY, fresh)
    },
  })

  if (isPending || error || !data) return null

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          O que você quer receber
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      <p className="mb-2 text-xs leading-relaxed text-gray-muted">
        Vale para a sua conta, em qualquer canal. O bloco acima liga ou desliga apenas este
        dispositivo.
      </p>

      {mutation.isError && (
        <p className="mb-2 text-xs font-medium text-red" role="alert">
          {(mutation.error as Error).message}
        </p>
      )}

      <div>
        {data.types.map((type) => (
          <PreferenceRow
            key={type.code}
            type={type}
            busy={mutation.isPending}
            onToggle={(enabled) => mutation.mutate({ code: type.code, enabled })}
          />
        ))}
      </div>
    </section>
  )
}
