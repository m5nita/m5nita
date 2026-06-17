import { useState } from 'react'
import { apiFetch } from '../../../lib/api'
import { Button } from '../../ui/Button'

type PaywallProps = {
  poolId: string
  price: { formatted: string }
  teaser: { headline: string }
  onUnlocked: () => void
}

const SAMPLE_BLOCKS = [
  'Sua posição no ranking',
  'Aproveitamento vs média e líder',
  'Seu perfil de palpiteiro + dicas',
  'Evolução, forma recente e eficiência',
]

/**
 * Locked state: a blurred sample of the panel + the unlock CTA. POSTs to the
 * unlock endpoint and redirects to the Pix checkout; in dev (mock gateway,
 * no checkoutUrl) it refetches so the now-unlocked panel renders.
 */
export function StatsPaywall({ poolId, price, teaser, onUnlocked }: PaywallProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function unlock() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/pools/${poolId}/stats/unlock`, { method: 'POST' })
      if (!res.ok) throw new Error('Não foi possível iniciar o desbloqueio')
      const data = (await res.json()) as { payment: { checkoutUrl: string | null } }
      if (data.payment.checkoutUrl) {
        window.location.href = data.payment.checkoutUrl
        return
      }
      onUnlocked()
    } catch (err) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="relative overflow-hidden border-2 border-border">
      <div className="flex flex-col gap-3 p-6 blur-[3px] select-none" aria-hidden="true">
        {SAMPLE_BLOCKS.map((label) => (
          <div key={label} className="flex flex-col gap-2 border-l-4 border-black pl-4">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-text-primary">
              {label}
            </p>
            <div className="h-2 w-3/4 bg-gray-light" />
            <div className="h-2 w-1/2 bg-border" />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-surface/70 px-6 text-center backdrop-blur-[1px]">
        <p className="font-display text-lg font-black uppercase tracking-wide text-text-primary">
          {teaser.headline}
        </p>
        <p className="max-w-xs text-sm text-text-secondary">
          Compare seu desempenho com a média do bolão e o líder, e veja onde você ganha ou perde
          pontos.
        </p>
        <Button onClick={unlock} loading={loading} size="lg">
          Desbloquear por {price.formatted}
        </Button>
        <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
          Pagamento único
        </p>
        {error && <p className="text-xs text-red">{error}</p>}
      </div>
    </div>
  )
}
