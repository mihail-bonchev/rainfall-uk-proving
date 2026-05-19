import type { TimeRange } from '../types/api'
import { Button } from './ui/button'

const PRESETS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '28d', label: '28d' },
  { value: 'custom', label: 'Custom' },
]

interface Props {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

export function TimeRangeControl({ value, onChange }: Props) {
  return (
    <div
      data-testid="time-range-control"
      style={{
        position: 'absolute',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
      }}
      className="flex gap-1 bg-white/90 backdrop-blur-sm rounded-xl px-2 py-1 shadow-md overflow-x-auto max-w-[calc(100vw-32px)]"
    >
      {PRESETS.map((preset) => (
        <Button
          key={preset.value}
          variant={value === preset.value ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(preset.value)}
          aria-pressed={value === preset.value}
          className="whitespace-nowrap"
        >
          {preset.label}
        </Button>
      ))}
    </div>
  )
}
