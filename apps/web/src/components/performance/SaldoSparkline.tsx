const W = 320
const H = 90
const PAD_X = 6
const PAD_TOP = 8
const PAD_BOTTOM = 8

/**
 * The career profit/loss curve: cumulative saldo, one point per pool in
 * chronological order. A zero baseline anchors profit vs loss; the line and the
 * endpoint dot are colored by the final sign. Pure inline SVG, no chart lib.
 */
export function SaldoSparkline({ points }: { points: { saldoCentavos: number }[] }) {
  if (points.length < 2) return null

  const vals = points.map((p) => p.saldoCentavos)
  const min = Math.min(0, ...vals)
  const max = Math.max(0, ...vals)
  const span = max - min || 1
  const plotW = W - PAD_X * 2
  const plotH = H - PAD_TOP - PAD_BOTTOM

  const x = (i: number) => PAD_X + (i / (vals.length - 1)) * plotW
  const y = (v: number) => PAD_TOP + plotH - ((v - min) / span) * plotH

  const last = vals[vals.length - 1] ?? 0
  const positive = last >= 0
  const line = positive ? 'stroke-green' : 'stroke-red'
  const dot = positive ? 'fill-green' : 'fill-red'
  const poly = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Evolução do saldo ao longo dos bolões"
    >
      <line
        x1={PAD_X}
        y1={y(0)}
        x2={W - PAD_X}
        y2={y(0)}
        className="stroke-border"
        strokeWidth={1}
        strokeDasharray="3 4"
      />
      <polyline
        points={poly}
        fill="none"
        className={line}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(vals.length - 1)} cy={y(last)} r={3.5} className={dot} />
    </svg>
  )
}
