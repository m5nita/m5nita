import { useCelebrateOnce } from '../../lib/celebrate'
import { formatCurrency, formatDate } from '../../lib/utils'
import { Confetti } from '../ui/Confetti'

interface WithdrawalStatusCardProps {
  amount: number
  /** Já mascarada pela API — nunca mascarar de novo aqui. */
  pixKey: string
  status: string
  requestedAt: string
  paidAt?: string | null
  poolName?: string
  /** Chave de celebração única (ex.: `paid:{poolId}`); null desliga o confete. */
  celebrateKey?: string | null
}

/**
 * Estado da retirada, nas duas superfícies que o mostram (home e hub do bolão).
 * Um lugar só para a regra "solicitada vs paga" não divergir entre elas.
 */
export function WithdrawalStatusCard({
  amount,
  pixKey,
  status,
  requestedAt,
  paidAt,
  poolName,
  celebrateKey = null,
}: WithdrawalStatusCardProps) {
  const isPaid = status === 'completed'
  // Hook incondicional (Rules of Hooks): a chave é null quando não há o que celebrar.
  const celebrate = useCelebrateOnce(isPaid && celebrateKey ? celebrateKey : null)

  if (isPaid) {
    return (
      <>
        {celebrate && <Confetti count={120} />}
        <div className="border-2 border-green bg-green/5 p-6 text-center">
          {poolName && (
            <p className="mb-1 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted">
              {poolName}
            </p>
          )}
          <p className="font-display text-xs font-bold uppercase tracking-widest text-green">
            Prêmio pago
          </p>
          <p className="mt-1 font-display text-5xl font-black leading-none text-green">
            {formatCurrency(amount)}
          </p>
          <p className="mt-2 text-xs text-gray-muted">
            enviado para {pixKey}
            {paidAt && ` em ${formatDate(paidAt)}`}
          </p>
        </div>
      </>
    )
  }

  return (
    <div className="border-l-4 border-green bg-green/5 p-4">
      {poolName && (
        <p className="font-display text-sm font-bold uppercase tracking-wide text-black truncate">
          {poolName}
        </p>
      )}
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
        Retirada solicitada
      </p>
      <p className="mt-1 font-display text-3xl font-black leading-none text-green">
        {formatCurrency(amount)}
      </p>
      <p className="mt-2 text-xs text-gray-muted">
        PIX {pixKey} · {formatDate(requestedAt)}
      </p>
      <p className="mt-1 text-xs text-gray-muted">
        Em análise — avisamos assim que o PIX for enviado.
      </p>
    </div>
  )
}
