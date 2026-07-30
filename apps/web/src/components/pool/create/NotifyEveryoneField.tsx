/**
 * Opt-in for the "novo bolão" announcement. Unchecked by default — telling the
 * whole base is an explicit act, never a side effect of creating a pool.
 */
export function NotifyEveryoneField({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label
      htmlFor="notify-everyone"
      className="flex cursor-pointer items-start gap-3 border-2 border-border p-3 transition-colors hover:border-black"
    >
      <input
        id="notify-everyone"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-black"
      />
      <span className="flex flex-col gap-1">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-black">
          Avisar todo mundo do m5nita
        </span>
        <span className="text-xs leading-relaxed text-gray-muted">
          Ao confirmar o pagamento, quem usa o m5nita recebe um aviso com o link para entrar neste
          bolão. Quem preferir não receber pode desligar nas configurações.
        </span>
      </span>
    </label>
  )
}
