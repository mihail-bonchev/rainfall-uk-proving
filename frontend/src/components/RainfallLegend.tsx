import type { TimeRange } from '../types/api'

const BASE_STEPS = [
  { threshold: 0.1, colour: '#a8d5f5', label: '0.1' },
  { threshold: 0.5, colour: '#50c8f4', label: '0.5' },
  { threshold: 2,   colour: '#00a651', label: '2' },
  { threshold: 5,   colour: '#fff200', label: '5' },
  { threshold: 10,  colour: '#ff7f00', label: '10' },
  { threshold: 20,  colour: '#e8001d', label: '20' },
  { threshold: 50,  colour: '#9b0026', label: '50' },
]

const DAY_MULTIPLIERS: Partial<Record<TimeRange, number>> = {
  '7d': 7,
  '28d': 28,
}

const PERIOD_LABELS: Record<TimeRange, string> = {
  '15m': 'Latest reading (mm)',
  '6h': '6 h total (mm)',
  '24h': '24 h total (mm)',
  '7d': '7-day total (mm)',
  '28d': '28-day total (mm)',
  'custom': 'Period total (mm)',
}

function fmt(n: number): string {
  if (n >= 10) return String(Math.round(n))
  // Avoid floating-point noise (e.g. 0.1 × 7 = 0.7000000000000001)
  return parseFloat(n.toPrecision(2)).toString()
}

interface Props {
  timeRange: TimeRange
}

export function RainfallLegend({ timeRange }: Props) {
  const mult = DAY_MULTIPLIERS[timeRange] ?? 1
  const steps = BASE_STEPS.map((s) => ({
    colour: s.colour,
    label: fmt(s.threshold * mult),
  }))

  return (
    <div
      style={{ position: 'absolute', bottom: 32, left: 16, zIndex: 10 }}
      className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md pointer-events-none select-none"
    >
      <p className="text-xs font-semibold text-foreground mb-1.5">{PERIOD_LABELS[timeRange]}</p>
      <div className="flex flex-col gap-0.5">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 h-3 rounded-sm border border-black/10"
              style={{ background: s.colour }}
            />
            <span className="text-[11px] text-muted-foreground">≥ {s.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="inline-block w-4 h-3 rounded-sm border border-black/10 bg-transparent" />
          <span className="text-[11px] text-muted-foreground">Dry / no data</span>
        </div>
      </div>
    </div>
  )
}
