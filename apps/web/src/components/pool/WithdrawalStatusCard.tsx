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
  /**
   * O que o título do card anuncia.
   *
   * `status` (padrão) na home, onde a lista tem vários bolões e o que importa
   * é em que pé está cada retirada. `win` no hub, onde o bolão é um só e quem
   * está lendo é o vencedor — ali o título celebra e o estado da retirada desce
   * para a linha de detalhe, num card só em vez de dois dizendo o mesmo valor.
   */
  headline?: 'status' | 'win'
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
  headline = 'status',
}: WithdrawalStatusCardProps) {
  const isPaid = status === 'completed'
  // Hook incondicional (Rules of Hooks): a chave é null quando não há o que celebrar.
  const celebrate = useCelebrateOnce(isPaid && celebrateKey ? celebrateKey : null)

  const isWin = headline === 'win'
  const title = isWin ? 'Você ganhou' : isPaid ? 'Prêmio pago' : 'Retirada solicitada'

  // Com o título celebrando, o estado da retirada precisa aparecer no detalhe —
  // é a única coisa que distingue "pedimos" de "caiu na conta".
  const detail = isPaid
    ? `${isWin ? 'Prêmio pago · ' : ''}enviado para ${pixKey}${paidAt ? ` em ${formatDate(paidAt)}` : ''}`
    : `${isWin ? 'Retirada solicitada · ' : ''}PIX ${pixKey} · ${formatDate(requestedAt)}`

  // O hub trata as duas fases como conquista (caixa cheia, centrada); a home
  // mantém a barra lateral para a retirada ainda em análise.
  const framed = isPaid || isWin

  return (
    <>
      {celebrate && <Confetti count={120} />}
      <div
        className={
          framed
            ? 'border-2 border-green bg-green/5 p-6 text-center'
            : 'border-l-4 border-green bg-green/5 p-4'
        }
      >
        {poolName && (
          <p
            className={
              framed
                ? 'mb-1 font-display text-[10px] font-bold uppercase tracking-widest text-gray-muted'
                : 'font-display text-sm font-bold uppercase tracking-wide text-black truncate'
            }
          >
            {poolName}
          </p>
        )}
        <p
          className={`font-display text-xs font-bold uppercase tracking-widest ${
            framed ? 'text-green' : 'text-gray-muted'
          }`}
        >
          {title}
        </p>
        <p
          className={`mt-1 font-display font-black leading-none text-green ${
            framed ? 'text-5xl' : 'text-3xl'
          }`}
        >
          {formatCurrency(amount)}
        </p>
        <p className="mt-2 text-xs text-gray-muted">{detail}</p>
        {!isPaid && (
          <p className="mt-1 text-xs text-gray-muted">
            Em análise — avisamos assim que o PIX for enviado.
          </p>
        )}
      </div>
    </>
  )
}
