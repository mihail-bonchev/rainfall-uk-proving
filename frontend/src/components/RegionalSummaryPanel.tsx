import { useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet'
import { Button } from './ui/button'
import { useIsMobile } from '../hooks/useIsMobile'
import { useStations } from '../hooks/useStations'
import { useRegionalSummary } from '../hooks/useRegionalSummary'
import type { AreaSummary } from '../services/aggregation/regionalAggregator'
import type { TimeRange } from '../types/api'

type SortKey = keyof Pick<AreaSummary, 'areaName' | 'totalMm' | 'avgMm' | 'stationsWithData'>
type SortDir = 'asc' | 'desc'

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '15m': 'Last 15 minutes',
  '6h': 'Last 6 hours',
  '24h': 'Last 24 hours',
  '7d': '7-day',
  '28d': '28-day',
  'custom': 'Custom period',
}

function computeQuartiles(areas: AreaSummary[]): { q1: number; q3: number } {
  if (areas.length < 4) return { q1: -Infinity, q3: Infinity }
  const sorted = [...areas].sort((a, b) => a.totalMm - b.totalMm)
  const q1 = sorted[Math.floor(sorted.length * 0.25)].totalMm
  const q3 = sorted[Math.floor(sorted.length * 0.75)].totalMm
  return { q1, q3 }
}

function sortAreas(areas: AreaSummary[], key: SortKey, dir: SortDir): AreaSummary[] {
  return [...areas].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'string' && typeof bv === 'string') {
      return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }
    return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
  })
}

interface SortHeaderProps {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}

function SortHeader({ label, sortKey, currentKey, dir, onSort }: SortHeaderProps) {
  const active = sortKey === currentKey
  return (
    <th
      className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground whitespace-nowrap"
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

interface Props {
  open: boolean
  onClose: () => void
  timeRange: TimeRange
  customRange?: DateRange
  onDownloadCsv?: (areas: AreaSummary[]) => void
}

export function RegionalSummaryPanel({ open, onClose, timeRange, customRange, onDownloadCsv }: Props) {
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>('totalMm')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const { data: stations = [] } = useStations()
  const { data: areas, isLoading, isError } = useRegionalSummary(timeRange, stations, customRange)

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = areas ? sortAreas(areas, sortKey, sortDir) : []
  const { q1, q3 } = areas ? computeQuartiles(areas) : { q1: -Infinity, q3: Infinity }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        data-testid="regional-summary-panel"
        side={isMobile ? 'bottom' : 'left'}
        className={isMobile ? 'h-[85vh] overflow-y-auto' : 'sm:w-[480px] sm:max-w-none overflow-y-auto'}
      >
        <SheetHeader>
          <SheetTitle data-testid="regional-panel-title">
            Regional Summary
          </SheetTitle>
          <SheetDescription data-testid="regional-panel-subtitle">
            {TIME_RANGE_LABELS[timeRange]} · All 14 EA areas
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {isLoading && (
            <div data-testid="regional-loading" className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Loading rainfall data…
            </div>
          )}

          {isError && !isLoading && (
            <table data-testid="regional-table" className="w-full text-sm">
              <tbody>
                <tr>
                  <td data-testid="regional-no-data" colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    No data available
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {!isLoading && !isError && (
            <>
              <div className="overflow-x-auto -mx-4 px-4">
              <table data-testid="regional-table" className="w-full text-sm border-collapse min-w-[420px]">
                <thead>
                  <tr className="border-b">
                    <SortHeader label="Area" sortKey="areaName" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Total (mm)" sortKey="totalMm" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Avg/station (mm)" sortKey="avgMm" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortHeader label="Stations w/ data" sortKey="stationsWithData" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr>
                      <td data-testid="regional-no-data" colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        No data for this period
                      </td>
                    </tr>
                  ) : (
                    sorted.map((area) => {
                      const isHigh = area.totalMm > q3
                      const isLow = area.totalMm < q1 && area.stationsWithData > 0
                      return (
                        <tr
                          key={area.areaName}
                          data-testid="regional-row"
                          className={[
                            'border-b transition-colors',
                            isHigh ? 'bg-blue-50 dark:bg-blue-950/20' : '',
                            isLow ? 'bg-slate-50 dark:bg-slate-900/20' : '',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2 font-medium">{area.areaName}</td>
                          <td className="px-3 py-2 tabular-nums">{area.totalMm.toFixed(1)}</td>
                          <td className="px-3 py-2 tabular-nums">{area.avgMm.toFixed(1)}</td>
                          <td className="px-3 py-2 tabular-nums">{area.stationsWithData} / {area.stationCount}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              </div>

              {onDownloadCsv && areas && areas.length > 0 && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="download-csv-btn"
                    onClick={() => onDownloadCsv(areas)}
                  >
                    Download CSV
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
