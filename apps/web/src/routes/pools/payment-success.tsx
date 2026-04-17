import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { apiFetch } from '../../lib/api'

type ConfirmState =
  | { kind: 'checking' }
  | { kind: 'completed' }
  | { kind: 'expired' }
  | { kind: 'error'; message: string }

type ConfirmRequest = {
  orderNsu: string
  invoiceSlug?: string
  transactionNsu?: string
}

const MAX_ATTEMPTS = 6
const POLL_INTERVAL_MS = 2000

async function confirmPayment(req: ConfirmRequest): Promise<string> {
  const res = await apiFetch('/api/payments/infinitepay/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || data.error || `HTTP ${res.status}`)
  }
  const data = (await res.json()) as { status?: string }
  return data.status ?? 'unknown'
}

function mapStatusToState(status: string, attempt: number): ConfirmState | null {
  if (status === 'completed') return { kind: 'completed' }
  if (status === 'expired') return { kind: 'expired' }
  if (attempt >= MAX_ATTEMPTS) {
    return {
      kind: 'error',
      message: 'O pagamento ainda está sendo processado. Atualize a página em alguns instantes.',
    }
  }
  return null
}

function Panel({
  eyebrow,
  eyebrowColor,
  title,
  barColor,
  children,
  action,
}: {
  eyebrow: string
  eyebrowColor: string
  title: string
  barColor: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-[60vh] flex-col justify-center lg:items-center">
      <div className="lg:w-full lg:max-w-[480px] lg:border lg:border-border lg:p-10">
        <div className="mb-8">
          <p
            className={`font-display text-xs font-semibold uppercase tracking-widest ${eyebrowColor}`}
          >
            {eyebrow}
          </p>
          <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">
            {title}
          </h1>
          <div className={`mt-3 h-1 w-12 ${barColor}`} />
          <p className="mt-4 text-sm text-gray-dark">{children}</p>
        </div>
        {action}
      </div>
    </div>
  )
}

function PaymentSuccessPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/pools/payment-success' })
  const paymentId = search.payment_id
  const [state, setState] = useState<ConfirmState>(
    paymentId ? { kind: 'checking' } : { kind: 'completed' },
  )
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!paymentId) return
    cancelledRef.current = false

    const request: ConfirmRequest = {
      orderNsu: paymentId,
      invoiceSlug: search.invoice_slug,
      transactionNsu: search.transaction_nsu,
    }

    let attempt = 0
    async function tick() {
      if (cancelledRef.current) return
      attempt += 1
      try {
        const status = await confirmPayment(request)
        if (cancelledRef.current) return
        const next = mapStatusToState(status, attempt)
        if (next) setState(next)
        else setTimeout(tick, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelledRef.current) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Erro ao confirmar pagamento.',
        })
      }
    }
    tick()

    return () => {
      cancelledRef.current = true
    }
  }, [paymentId, search.invoice_slug, search.transaction_nsu])

  const homeButton = (
    <Button onClick={() => navigate({ to: '/' })} size="lg" className="w-full">
      Ir para Home
    </Button>
  )

  if (state.kind === 'checking') {
    return (
      <Panel
        eyebrow="Aguarde"
        eyebrowColor="text-gray-dark"
        title="Confirmando Pagamento"
        barColor="bg-black"
      >
        Estamos verificando a confirmação do seu pagamento junto à operadora. Isso leva alguns
        segundos.
      </Panel>
    )
  }

  if (state.kind === 'expired') {
    return (
      <Panel
        eyebrow="Pagamento não concluído"
        eyebrowColor="text-red"
        title="Pagamento Recusado ou Expirado"
        barColor="bg-red"
        action={homeButton}
      >
        O pagamento não foi concluído. Você pode tentar novamente a partir da tela do bolão.
      </Panel>
    )
  }

  if (state.kind === 'error') {
    return (
      <Panel
        eyebrow="Processando"
        eyebrowColor="text-gray-dark"
        title="Aguardando Confirmação"
        barColor="bg-black"
        action={homeButton}
      >
        {state.message}
      </Panel>
    )
  }

  return (
    <Panel
      eyebrow="Sucesso"
      eyebrowColor="text-green"
      title="Pagamento Confirmado"
      barColor="bg-green"
      action={homeButton}
    >
      Seu pagamento foi processado. Você já faz parte do bolão!
    </Panel>
  )
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const Route = createFileRoute('/pools/payment-success')({
  component: PaymentSuccessPage,
  validateSearch: (search: Record<string, unknown>) => ({
    payment_id: pickString(search.payment_id),
    invoice_slug: pickString(search.invoice_slug) ?? pickString(search.slug),
    transaction_nsu: pickString(search.transaction_nsu),
  }),
})
