import { useEffect, useState } from 'react'
import { useSession } from '../../lib/auth'
import { isIosTabWithoutPush, isPushSupported, subscribe } from '../../lib/push'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

const SEEN_KEY = 'm5nita.push.promptSeen'

// Soft, one-time opt-in shown when a signed-in user opens the app. Not tied to a
// first palpite (existing users already have predictions). On any outcome the
// `localStorage` flag is set so it never auto-appears again; /settings always
// offers the toggle. iOS Safari-tab users get an "Add to Home Screen" hint.
export function PushOptInPrompt() {
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session?.user) return
    if (localStorage.getItem(SEEN_KEY)) return
    const canPrompt = isPushSupported() && Notification.permission === 'default'
    if (canPrompt || isIosTabWithoutPush()) setOpen(true)
  }, [session?.user])

  function dismiss() {
    localStorage.setItem(SEEN_KEY, '1')
    setOpen(false)
  }

  async function enable() {
    setBusy(true)
    try {
      await subscribe()
    } finally {
      dismiss()
      setBusy(false)
    }
  }

  if (!open) return null

  const iosTab = isIosTabWithoutPush()
  return (
    <Modal open={open} onClose={dismiss} ariaLabel="Ativar notificações">
      <div className="px-5 pb-6 pt-1 text-black">
        <h2 className="font-display text-xl font-black">Receba avisos do bolão</h2>
        <p className="mt-2 text-sm text-gray-dark leading-relaxed">
          {iosTab
            ? 'Para receber notificações no iPhone, adicione o m5nita à Tela de Início e abra por lá.'
            : 'Avisamos quando seu jogo está perto de começar e quando você pontua. Sem spam.'}
        </p>
        <div className="mt-5 flex items-center gap-3">
          {iosTab ? (
            <Button onClick={dismiss}>Entendi</Button>
          ) : (
            <>
              <Button onClick={enable} loading={busy}>
                Ativar notificações
              </Button>
              <Button variant="ghost" size="sm" onClick={dismiss} disabled={busy}>
                Agora não
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
