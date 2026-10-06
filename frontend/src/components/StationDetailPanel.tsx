import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { ExternalLink } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from './ui/sheet'
import { Button } from './ui/button'
import { useIsMobile } from '../hooks/useIsMobile'
import { useStations } from '../hooks/useStations'
import { fetchStationReadings } from '../services/api/historicalService'
import { supabase } from '../services/db/supabaseClient'
import type { TimeRange, Reading } from '../types/api'

const PERIOD_TOTAL_LABEL: Record<TimeRange, string> = {
  '15m': 'latest reading',
  '6h': '6-hour total',
  '24h': '24-hour total',
  '7d': '7-day total',
  '28d': '28-day total',
  'custom': 'period total',
}

interface Props {
  stationId: string | null
  timeRange: TimeRange
  readingsMap?: Map<string, number>
  onClose: () => void
  onViewAreaSummary?: (area: string) => void
}

interface ChartPoint {
  dateTime: string
  value: number
}

function formatCoords(lat: number, long: number): string {
  return `${lat.toFixed(4)}° N, ${Math.abs(long).toFixed(4)}° ${long < 0 ? 'W' : 'E'}`
}

function formatAge(dateTime: string): string {
  const mins = Math.floor((Date.now() - new Date(dateTime).getTime()) / 60_000)
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} h ago` : `${h} h ${m} min ago`
}

function formatTime(dateTime: string): string {
  return new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function getRainfallColour(mm: number): string {
  if (mm >= 50) return '#9b0026'
  if (mm >= 20) return '#e8001d'
  if (mm >= 10) return '#ff7f00'
  if (mm >= 5) return '#fff200'
  if (mm >= 2) return '#00a651'
  if (mm >= 0.5) return '#50c8f4'
  if (mm >= 0.1) return '#a8d5f5'
  return '#e5e7eb'
}

function timeRangeToMs(timeRange: TimeRange): number {
  const MINUTE = 60_000
  const map: Record<TimeRange, number> = {
    '15m': 15 * MINUTE,
    '6h': 6 * 60 * MINUTE,
    '24h': 24 * 60 * MINUTE,
    '7d': 7 * 24 * 60 * MINUTE,
    '28d': 28 * 24 * 60 * MINUTE,
    'custom': 24 * 60 * MINUTE,
  }
  return map[timeRange]
}

function aggregateToHourly(readings: Reading[]): ChartPoint[] {
  const buckets = new Map<string, number[]>()
  for (const r of readings) {
    const d = new Date(r.dateTime)
    d.setMinutes(0, 0, 0)
    const key = d.toISOString()
    const arr = buckets.get(key) ?? []
    arr.push(r.value)
    buckets.set(key, arr)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateTime, values]) => ({
      dateTime,
      value: values.reduce((sum, v) => sum + v, 0) / values.length,
    }))
}

async function fetchWindow(stationId: string, windowMs: number) {
  const to = new Date()
  const from = new Date(to.getTime() - windowMs)
  const readings = await fetchStationReadings(stationId, from, to)
  return readings
    .filter((r) => new Date(r.dateTime).getTime() > from.getTime())
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
}

function useCurrentReading(stationId: string | null) {
  return useQuery({
    queryKey: ['current-reading', stationId],
    queryFn: async () => {
      const readings = await fetchWindow(stationId!, 24 * 60 * 60 * 1000)
      return readings.length > 0 ? readings[readings.length - 1] : null
    },
    enabled: !!stationId,
    staleTime: 60_000,
  })
}

function useChartData(stationId: string | null, timeRange: TimeRange) {
  return useQuery({
    queryKey: ['chart-data', stationId, timeRange],
    queryFn: async () => {
      const readings = await fetchWindow(stationId!, timeRangeToMs(timeRange))
      const useHourly = timeRange === '7d' || timeRange === '28d'
      return useHourly
        ? aggregateToHourly(readings)
        : readings.map((r) => ({ dateTime: r.dateTime, value: r.value }))
    },
    enabled: !!stationId,
    staleTime: 60_000,
  })
}

interface DailyPoint {
  date: string
  value: number
}

function useStationDailyTotals(stationId: string | null, timeRange: '7d' | '28d') {
  const days = timeRange === '7d' ? 7 : 28
  return useQuery<DailyPoint[]>({
    queryKey: ['station-daily-totals', stationId, timeRange],
    queryFn: async () => {
      const today = new Date()
      const todayStr = today.toISOString().slice(0, 10)
      const start = new Date(today)
      start.setUTCDate(start.getUTCDate() - days)
      const startStr = start.toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('station_daily_totals')
        .select('date, total_mm')
        .eq('station_ref', stationId!)
        .gte('date', startStr)
        .lt('date', todayStr)
        .order('date', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []).map((row) => ({ date: row.date as string, value: Number(row.total_mm) }))
    },
    enabled: !!stationId,
    staleTime: 60 * 60 * 1000,
  })
}

function xTickFormatter(dateTime: string): string {
  return new Date(dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dateTickFormatter(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function StationDetailPanel({ stationId, timeRange, readingsMap, onClose, onViewAreaSummary }: Props) {
  const isMobile = useIsMobile()
  const { data: stations = [] } = useStations()
  const station = stations.find((s) => s.id === stationId) ?? null
  const { data: reading } = useCurrentReading(stationId)

  const isHistorical = timeRange === '7d' || timeRange === '28d'
  const periodTotal = stationId ? (readingsMap?.get(stationId) ?? null) : null
  const { data: chartData = [] } = useChartData(isHistorical ? null : stationId, timeRange)
  const { data: dailyData = [] } = useStationDailyTotals(
    isHistorical ? stationId : null,
    isHistorical ? timeRange : '7d',
  )

  return (
    <Sheet open={!!stationId} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        data-testid="station-detail-panel"
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[85vh]' : 'sm:w-[35%] sm:max-w-none'}
      >
        <SheetHeader>
          <SheetTitle data-testid="panel-station-name">
            {station?.label ?? stationId}
          </SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              {station?.eaAreaName && (
                <span data-testid="panel-area">{station.eaAreaName}</span>
              )}
              {station?.gridReference && (
                <span data-testid="panel-grid-ref">{station.gridReference}</span>
              )}
              {station && (
                <span data-testid="panel-coords">{formatCoords(station.lat, station.long)}</span>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 py-3" data-testid="current-reading-section">
          {isHistorical ? (
            periodTotal !== null ? (
              <div data-testid="period-total">
                <div
                  className="text-3xl font-bold tabular-nums"
                  style={{ color: getRainfallColour(periodTotal) }}
                >
                  {periodTotal.toFixed(1)} mm
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {PERIOD_TOTAL_LABEL[timeRange]}
                </div>
              </div>
            ) : null
          ) : reading === undefined ? null : reading === null ? (
            <p data-testid="no-recent-data" className="text-sm text-muted-foreground">
              No recent data
            </p>
          ) : (
            <div className="flex items-center gap-3">
              <span
                data-testid="reading-badge"
                className="rounded px-2 py-1 text-sm font-semibold"
                style={{
                  backgroundColor: getRainfallColour(reading.value),
                  color: reading.value >= 5 && reading.value < 20 ? '#000' : '#fff',
                }}
              >
                {reading.value.toFixed(1)} mm
              </span>
              <span data-testid="reading-meta" className="text-sm text-muted-foreground">
                at {formatTime(reading.dateTime)} · {formatAge(reading.dateTime)}
              </span>
            </div>
          )}
        </div>

        <SheetFooter className="px-4 flex flex-col gap-2">
          {station?.eaAreaName && onViewAreaSummary && (
            <Button
              variant="secondary"
              size="sm"
              data-testid="view-area-summary-btn"
              onClick={() => onViewAreaSummary(station.eaAreaName)}
            >
              View {station.eaAreaName} summary
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://environment.data.gov.uk/flood-monitoring/id/stations/${stationId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View this station on the EA website"
              data-testid="ea-link"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on EA website
            </a>
          </Button>
        </SheetFooter>

        <div className="px-4" data-testid="chart-section">
          {isHistorical ? (
            dailyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No daily data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={dateTickFormatter}
                    tick={{ fontSize: 11 }}
                    minTickGap={timeRange === '28d' ? 28 : 16}
                  />
                  <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} width={32} unit=" mm" />
                  <Tooltip
                    formatter={(v: unknown) => [`${(v as number).toFixed(1)} mm`, 'Daily total']}
                    labelFormatter={(d: unknown) =>
                      new Date(d as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    }
                  />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                    {dailyData.map((entry, i) => (
                      <Cell key={i} fill={getRainfallColour(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="dateTime"
                  tickFormatter={xTickFormatter}
                  tick={{ fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis domain={[0, 'auto']} tick={{ fontSize: 11 }} width={32} unit=" mm" />
                <Tooltip
                  formatter={(v: unknown) => [`${(v as number).toFixed(1)} mm`, 'Rainfall']}
                  labelFormatter={(t: unknown) => new Date(t as string).toLocaleString()}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#50c8f4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
