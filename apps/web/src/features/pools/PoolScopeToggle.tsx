export type PoolScopeMode = 'range' | 'single'

interface PoolScopeToggleProps {
  value: PoolScopeMode
  onChange: (next: PoolScopeMode) => void
  disabled?: boolean
}

export function PoolScopeToggle({ value, onChange, disabled }: PoolScopeToggleProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
        Escopo do bolão
      </p>
      <div
        className="grid grid-cols-2 border-2 border-border bg-cream"
        role="tablist"
        aria-label="Escopo do bolão"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'range'}
          disabled={disabled}
          onClick={() => onChange('range')}
          className={`px-4 py-2 text-center font-display text-xs font-semibold uppercase tracking-wider transition-colors duration-150 ${
            value === 'range'
              ? 'bg-black text-cream'
              : 'text-gray-dark hover:bg-border/40 disabled:opacity-50'
          }`}
        >
          Rodada / Faixa
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'single'}
          disabled={disabled}
          onClick={() => onChange('single')}
          className={`border-l-2 border-border px-4 py-2 text-center font-display text-xs font-semibold uppercase tracking-wider transition-colors duration-150 ${
            value === 'single'
              ? 'bg-black text-cream'
              : 'text-gray-dark hover:bg-border/40 disabled:opacity-50'
          }`}
        >
          Jogo único
        </button>
      </div>
    </div>
  )
}
