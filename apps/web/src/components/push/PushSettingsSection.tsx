import { type ReactNode, useEffect, useState } from 'react'
import {
  getPushStatus,
  isIosTabWithoutPush,
  type PushStatus,
  subscribe,
  unsubscribe,
} from '../../lib/push'
import { Button } from '../ui/Button'

// Per-device push control. Reflects the current status, toggles enable/disable,
// degrades gracefully when unsupported, and nudges installation on iOS tabs.
export function PushSettingsSection() {
  const [status, setStatus] = useState<PushStatus | 'loading'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushStatus().then(setStatus)
  }, [])

  async function enable() {
    setBusy(true)
    try {
      setStatus(await subscribe())
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      setStatus(await unsubscribe())
    } finally {
      setBusy(false)
    }
  }

  const iosTab = isIosTabWithoutPush()
  if (status === 'loading') return null
  if (status === 'unsupported' && !iosTab) return null

  let body: ReactNode
  if (iosTab) {
    body = (
      <p className="text-xs text-gray-dark leading-relaxed">
        Para ativar no iPhone, adicione o m5nita à Tela de Início e abra por lá.
      </p>
    )
  } else if (status === 'denied') {
    body = (
      <p className="text-xs text-gray-dark leading-relaxed">
        As notificações estão bloqueadas no navegador. Libere nas permissões do site para ativar.
      </p>
    )
  } else {
    const enabled = status === 'enabled'
    body = (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-dark leading-relaxed">
          Receba avisos de início de jogo e pontuação neste dispositivo.
        </p>
        <Button
          variant={enabled ? 'secondary' : 'primary'}
          size="sm"
          loading={busy}
          onClick={enabled ? disable : enable}
          aria-pressed={enabled}
        >
          {enabled ? 'Desativar' : 'Ativar'}
        </Button>
      </div>
    )
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Notificações no navegador
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>
      {body}
    </section>
  )
}
