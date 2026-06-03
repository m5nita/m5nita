function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function Bar({
  caption,
  value,
  colorClass,
}: {
  caption: string
  value: number
  colorClass: string
}) {
  const width = `${Math.min(100, Math.max(0, value * 100))}%`
  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 font-display text-[10px] font-semibold uppercase tracking-widest text-gray-muted">
        {caption}
      </span>
      <div className="h-2 flex-1 bg-border" aria-hidden="true">
        <div className={`h-full ${colorClass}`} style={{ width }} />
      </div>
      <span className="w-10 shrink-0 text-right font-display text-xs font-bold text-text-primary">
        {pct(value)}
      </span>
    </div>
  )
}

/**
 * Zero-dependency comparison bars: the viewer against the anonymized pool
 * average and the leader. Values are 0..1 ratios.
 */
export function CompareBar({
  label,
  you,
  average,
  leader,
}: {
  label: string
  you: number
  average: number
  leader: number
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-display text-xs font-bold uppercase tracking-wider text-text-primary">
        {label}
      </p>
      <Bar caption="Você" value={you} colorClass="bg-red" />
      <Bar caption="Média" value={average} colorClass="bg-gray-light" />
      <Bar caption="Líder" value={leader} colorClass="bg-green" />
    </div>
  )
}
