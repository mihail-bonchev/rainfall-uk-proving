import type { TimeRange } from '../types/api'

// Must match PERIOD_MAX_MM in StationsSource exactly — both use normalised totals.
const PERIOD_MAX_MM: Record<TimeRange, number> = {
  '15m':    5,
  '6h':     30,
  '24h':    50,
  '7d':     100,
  '28d':    250,
  'custom': 50,
}

const PERIOD_LABELS: Record<TimeRange, string> = {
  '15m': 'Rainfall — last 15 min',
  '6h':  'Rainfall — 6 h total',
  '24h': 'Rainfall — 24 h total',
  '7d':  'Rainfall — 7-day total',
  '28d': 'Rainfall — 28-day total',
  'custom': 'Rainfall — custom period',
}

function fmt(n: number): string {
  if (n >= 100) return `${Math.round(n)} mm`
  if (n >= 10) return `${Math.round(n)} mm`
  return `${parseFloat(n.toPrecision(2))} mm`
}

interface Props {
  timeRange: TimeRange
}

export function RainfallLegend({ timeRange }: Props) {
  const maxMm = PERIOD_MAX_MM[timeRange]
  // 6 evenly-spaced breakpoints from max down to near-zero
  const breakpoints = [1, 0.8, 0.65, 0.5, 0.35, 0.2].map((f) => maxMm * f)

  const gradient = `linear-gradient(to top,
    #081b2e 0%,
    #0d3b6e 16%,
    #1565c0 30%,
    #1976d2 44%,
    #42a5f5 58%,
    #90caf9 70%,
    #bbdefb 80%,
    #e3f2fd 88%,
    #00e676 100%
  )`

  return (
    <div
      style={{ position: 'absolute', bottom: 32, left: 16, zIndex: 10 }}
      className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2.5 shadow-lg pointer-events-none select-none text-white"
    >
      <p className="text-[10px] font-semibold mb-2 tracking-wide uppercase opacity-70">
        {PERIOD_LABELS[timeRange]}
      </p>
      <div className="flex items-stretch gap-2.5">
        <div
          className="w-3 rounded-sm flex-shrink-0"
          style={{ background: gradient, minHeight: 110 }}
        />
        <div className="flex flex-col justify-between text-[10px] leading-none">
          {breakpoints.map((mm, i) => (
            <span key={i} className={i === 0 ? 'opacity-90' : 'opacity-75'}>{fmt(mm)}</span>
          ))}
          <span className="opacity-40">Dry</span>
        </div>
      </div>
    </div>
  )
}
