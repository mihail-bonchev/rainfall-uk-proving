import type { DateRange } from 'react-day-picker'
import { isHistoricalRange, type TimeRange } from '../types/api'
import { Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { DateRangePicker } from './DateRangePicker'

const PRESETS: { value: TimeRange; label: string }[] = [
  { value: '15m', label: '15m' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '28d', label: '28d' },
  { value: '3m', label: '3m' },
]

interface Props {
  value: TimeRange
  onChange: (range: TimeRange) => void
  customRange?: DateRange
  onCustomRange?: (range: DateRange) => void
  /** Ranges whose data is still on its first load. */
  pending?: Partial<Record<TimeRange, boolean>>
}

function yesterdayUTC(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function TimeRangeControl({ value, onChange, customRange, onCustomRange, pending = {} }: Props) {
  const showCaveat = isHistoricalRange(value)
  const activePending = !!pending[value]

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
      className="flex flex-col items-center bg-slate-900/85 backdrop-blur-sm rounded-xl px-2 py-1 shadow-md max-w-[calc(100vw-32px)]"
    >
      <div className="flex gap-1 overflow-x-auto w-full">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            variant={value === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(preset.value)}
            aria-pressed={value === preset.value}
            aria-busy={!!pending[preset.value]}
            className={`whitespace-nowrap ${pending[preset.value] && value !== preset.value ? 'opacity-60' : ''}`}
          >
            {pending[preset.value] && <Loader2 className="size-3 animate-spin" aria-hidden />}
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
      {activePending && (
        <p data-testid="loading-caption" className="text-xs text-slate-400 mt-0.5 whitespace-nowrap">
          Collecting readings from ~1,000 stations — can take up to a minute…
        </p>
      )}
      {showCaveat && (
        <p
          data-testid="freshness-caveat"
          className="text-xs text-slate-400 mt-0.5 whitespace-nowrap"
        >
          Data complete to midnight {yesterdayUTC()}
        </p>
      )}
    </div>
  )
}
