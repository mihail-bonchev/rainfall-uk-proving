import { useState } from 'react'
import { differenceInDays, format } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { Calendar } from './ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover'
import { Button } from './ui/button'
import { useIsMobile } from '../hooks/useIsMobile'

const MAX_DAYS = 28

interface Props {
  value: DateRange | undefined
  onChange: (range: DateRange) => void
  triggerLabel?: string
  isActive?: boolean
}

export function DateRangePicker({ value, onChange, triggerLabel, isActive }: Props) {
  const isMobile = useIsMobile()
  const [pending, setPending] = useState<DateRange | undefined>(value)
  const [open, setOpen] = useState(false)

  const dayCount = pending?.from && pending?.to
    ? differenceInDays(pending.to, pending.from)
    : 0
  const exceedsLimit = dayCount > MAX_DAYS
  const hasValidRange = !!(pending?.from && pending?.to && !exceedsLimit)

  function handleOpen(nextOpen: boolean) {
    if (nextOpen) setPending(value)
    setOpen(nextOpen)
  }

  function apply() {
    if (hasValidRange && pending) {
      onChange(pending)
      setOpen(false)
    }
  }

  const label = triggerLabel ?? (
    value?.from && value?.to
      ? `${format(value.from, 'd MMM')} – ${format(value.to, 'd MMM')}`
      : 'Custom'
  )

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={isActive ? 'default' : 'outline'}
          size="sm"
          aria-pressed={isActive}
          data-testid="custom-range-trigger"
          className="whitespace-nowrap"
        >
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-testid="custom-range-popover"
        className="w-auto p-0"
        align="center"
      >
        <Calendar
          mode="range"
          selected={pending}
          onSelect={setPending}
          numberOfMonths={isMobile ? 1 : 2}
          disabled={{ after: new Date() }}
        />
        <div className="flex flex-col gap-2 px-4 pb-4">
          {exceedsLimit && (
            <p
              data-testid="range-limit-warning"
              className="text-xs text-destructive"
            >
              Ranges over {MAX_DAYS} days require the historical database (coming in Phase 2)
            </p>
          )}
          <Button
            size="sm"
            disabled={!hasValidRange}
            onClick={apply}
            data-testid="apply-range-btn"
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
