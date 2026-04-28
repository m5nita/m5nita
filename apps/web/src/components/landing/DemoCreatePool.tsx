import { POOL } from '@m5nita/shared'
import { formatCurrency } from '../../lib/utils'
import { useInViewportLoop } from './useInViewportLoop'
import { useTextWidth } from './useTextWidth'

const NAME_VALUE = 'Bolão da firma'
const SELECTED_INDEX = 1 // R$ 50,00 (POOL.QUICK_SELECT_VALUES[1] = 5000)

export function DemoCreatePool() {
  const { ref, isRunning } = useInViewportLoop<HTMLDivElement>()
  const typedRef = useTextWidth<HTMLSpanElement>(NAME_VALUE)
  const selectedFee = POOL.QUICK_SELECT_VALUES[SELECTED_INDEX]

  return (
    <section className="grid grid-cols-1 gap-10 py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14 lg:py-20 lg:items-center border-t border-border">
      <div className="copy">
        <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          01 — Crie um bolão
        </p>
        <h3 className="mt-2 font-display text-4xl font-black uppercase leading-[0.9] text-black lg:text-5xl">
          Em 30 segundos.
        </h3>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-dark">
          Nome, competição, valor de entrada. Pronto pra convidar a galera.
        </p>
      </div>

      <div
        ref={ref}
        className={`stage demo-d1 relative overflow-hidden border border-border bg-bg p-6 ${isRunning ? 'is-running' : ''}`}
      >
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
              Novo
            </p>
            <h4 className="mt-1 font-display text-3xl font-black leading-[0.9] text-black">
              Criar Bolão
            </h4>
            <div className="mt-3 h-1 w-12 bg-red" />
          </div>

          {/* Nome */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="demo-pool-name"
              className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark"
            >
              Nome do bolão
            </label>
            <div
              id="demo-pool-name"
              className="d1-name-input relative block h-[38px] overflow-hidden whitespace-nowrap border-b-2 border-border"
              style={{ lineHeight: '38px' }}
            >
              <span
                ref={typedRef}
                className="d1-name-typed inline-block overflow-hidden align-middle"
                style={{
                  borderRight: '2px solid var(--color-black)',
                  height: '16px',
                  width: 'var(--typed-width, 130px)',
                  lineHeight: '1',
                  fontSize: '16px',
                  fontWeight: 500,
                }}
              >
                {NAME_VALUE}
              </span>
            </div>
          </div>

          {/* Competição (custom dropdown) */}
          <div className="flex flex-col gap-1 relative">
            <label
              htmlFor="demo-competition"
              className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark"
            >
              Competição
            </label>
            <div
              id="demo-competition"
              className="d1-select-row relative flex items-center justify-end h-[38px] border-b-2 border-border"
            >
              <span className="placeholder absolute left-0 top-1/2 -translate-y-1/2 text-gray-muted text-base">
                Selecione uma competição
              </span>
              <span className="selected absolute left-0 top-1/2 -translate-y-1/2 text-black text-base font-medium opacity-0">
                Brasileirão 2026
              </span>
              <span
                className="d1-select-arrow inline-block w-2.5 h-2.5 relative"
                style={{ transition: 'transform 200ms' }}
              >
                <span
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    borderRight: '2px solid var(--color-gray-dark)',
                    borderBottom: '2px solid var(--color-gray-dark)',
                    transform: 'rotate(45deg) translate(-2px, -2px)',
                    transformOrigin: '70% 70%',
                  }}
                />
              </span>
            </div>
            <div
              className="d1-select-panel absolute top-full left-0 right-0 z-10 bg-bg border border-border mt-1"
              style={{ opacity: 0, transform: 'translateY(-4px)', pointerEvents: 'none' }}
            >
              <div className="px-3.5 py-2.5 border-b border-border text-sm">
                Premier League 2025/26
              </div>
              <div className="px-3.5 py-2.5 border-b border-border text-sm">La Liga 2025/26</div>
              <div className="px-3.5 py-2.5 border-b border-border text-sm">Copa do Mundo 2026</div>
              <div className="d1-option-highlight px-3.5 py-2.5 text-sm">Brasileirão 2026</div>
            </div>
          </div>

          {/* Valor de entrada */}
          <div className="flex flex-col gap-1">
            <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
              Valor da entrada
            </p>
            <div className="grid grid-cols-4 gap-2">
              {POOL.QUICK_SELECT_VALUES.map((value, idx) => {
                const selected = idx === SELECTED_INDEX
                return (
                  <button
                    key={value}
                    type="button"
                    className={`${selected ? 'd1-quick-selected' : ''} font-display text-xs font-bold uppercase tracking-wider py-2.5 border-2 border-border bg-transparent text-gray-dark`}
                  >
                    {formatCurrency(value)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* CTA */}
          <div className="d1-cta bg-black text-white border-2 border-black px-6 py-3.5 text-center font-display text-sm font-bold uppercase tracking-wider">
            Criar e Pagar {formatCurrency(selectedFee)}
          </div>
        </div>
      </div>
    </section>
  )
}
