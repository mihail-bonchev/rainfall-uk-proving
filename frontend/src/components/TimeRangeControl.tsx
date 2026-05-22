import type { DateRange } from 'react-day-picker'
import type { TimeRange } from '../types/api'
import { Button } from './ui/button'
import { DateRangePicker } from './DateRangePicker'

const PRESETS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '28d', label: '28d' },
]

interface Props {
  value: TimeRange
  onChange: (range: TimeRange) => void
  customRange?: DateRange
  onCustomRange?: (range: DateRange) => void
}

function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function TimeRangeControl({ value, onChange, customRange, onCustomRange }: Props) {
  const showCaveat = value === '7d' || value === '28d'

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
      className="flex flex-col items-center bg-white/90 backdrop-blur-sm rounded-xl px-2 py-1 shadow-md max-w-[calc(100vw-32px)]"
    >
      <div className="flex gap-1 overflow-x-auto w-full">
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
        <DateRangePicker
          value={value === 'custom' ? customRange : undefined}
          isActive={value === 'custom'}
          onChange={(range) => {
            onChange('custom')
            onCustomRange?.(range)
          }}
        />
      </div>
      {showCaveat && (
        <p
          data-testid="freshness-caveat"
          className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap"
        >
          Data complete to midnight {yesterdayUTC()}
        </p>
      )}
    </div>
  )
}
