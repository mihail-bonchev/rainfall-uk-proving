import type { TimeRange } from '../types/api'

const GRADIENT_STOPS = [
  { pct: 0,   colour: 'rgba(0,0,0,0)',     label: 'Dry / no data' },
  { pct: 20,  colour: '#a8d5f5',           label: 'Light' },
  { pct: 40,  colour: '#50c8f4',           label: '' },
  { pct: 55,  colour: '#00a651',           label: 'Moderate' },
  { pct: 70,  colour: '#fff200',           label: '' },
  { pct: 82,  colour: '#ff7f00',           label: 'Heavy' },
  { pct: 100, colour: '#e8001d',           label: 'Intense' },
]

const PERIOD_LABELS: Record<TimeRange, string> = {
  '15m': 'Rainfall — last 15 min',
  '6h':  'Rainfall — 6 h total',
  '24h': 'Rainfall — 24 h total',
  '7d':  'Rainfall — 7-day total',
  '28d': 'Rainfall — 28-day total',
  'custom': 'Rainfall — custom period',
}

interface Props {
  timeRange: TimeRange
}

export function RainfallLegend({ timeRange }: Props) {
  const gradient = `linear-gradient(to top, ${GRADIENT_STOPS.map((s) => `${s.colour} ${s.pct}%`).join(', ')})`

  return (
    <div
      style={{ position: 'absolute', bottom: 32, left: 16, zIndex: 10 }}
      className="bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2.5 shadow-lg pointer-events-none select-none text-white"
    >
      <p className="text-[11px] font-semibold mb-2 tracking-wide uppercase opacity-80">
        {PERIOD_LABELS[timeRange]}
      </p>
      <div className="flex items-stretch gap-2">
        <div
          className="w-3 rounded-sm"
          style={{ background: gradient, minHeight: 90 }}
        />
        <div className="flex flex-col justify-between text-[10px] opacity-90">
          <span>Intense</span>
          <span>Heavy</span>
          <span>Moderate</span>
          <span>Light</span>
          <span className="opacity-60">Dry</span>
        </div>
      </div>
    </div>
  )
}
