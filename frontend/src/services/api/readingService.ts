import type { Reading } from '../../types/api'
import type { DateRangeParams } from '../../utils/dateUtils'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

interface EAReading {
  stationReference?: string
  value: number | null
  dateTime: string
  measure: string
}

interface EAReadingsResponse {
  items: EAReading[]
}

export class ReadingFetchError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ReadingFetchError'
  }
}

// The bulk /data/readings endpoint omits stationReference — extract it from the measure URL.
// Measure URL format: .../id/measures/{stationRef}-rainfall-{rest}
function stationRefFromMeasure(measure: string): string {
  const id = measure.split('/').pop() ?? ''
  const idx = id.indexOf('-rainfall-')
  return idx > 0 ? id.slice(0, idx) : id.split('-')[0]
}

function normalise(raw: EAReading): Reading | null {
  if (raw.value == null || raw.value < 0) return null
  const stationRef = raw.stationReference ?? stationRefFromMeasure(raw.measure)
  if (!stationRef) return null
  return {
    stationRef,
    value: raw.value,
    dateTime: raw.dateTime,
    measure: raw.measure,
  }
}

export async function fetchLatestReadings(): Promise<Reading[]> {
  const url = `${EA_BASE}/data/readings?parameter=rainfall&latest&_limit=5000`
  const res = await fetch(url)
  if (!res.ok) {
    throw new ReadingFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as EAReadingsResponse
  return data.items.flatMap((r) => {
    const n = normalise(r)
    return n ? [n] : []
  })
}

// Fetch one day's readings (up to 10k). A day has ~96k readings total (1000 stations × 96 intervals)
// so 10k covers the first ~2.5 hours of that calendar day across all active stations.
async function fetchDayReadings(date: string): Promise<Reading[]> {
  const url = new URL(`${EA_BASE}/data/readings`)
  url.searchParams.set('parameter', 'rainfall')
  url.searchParams.set('_limit', '10000')
  url.searchParams.set('startdate', date)
  url.searchParams.set('enddate', date)
  const res = await fetch(url.toString())
  if (!res.ok) throw new ReadingFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as EAReadingsResponse
  return data.items.flatMap((r) => {
    const n = normalise(r)
    return n ? [n] : []
  })
}

// Enumerate calendar dates in the range [startdate, enddate].
function calendarDates(startdate: string, enddate: string): string[] {
  const dates: string[] = []
  const end = new Date(enddate + 'T12:00:00Z')
  for (const d = new Date(startdate + 'T12:00:00Z'); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

export async function fetchReadings(params: DateRangeParams): Promise<Reading[]> {
  const dates = calendarDates(params.startdate, params.enddate)

  let readings: Reading[]

  if (dates.length <= 1) {
    // Single day — one call.
    const url = new URL(`${EA_BASE}/data/readings`)
    url.searchParams.set('parameter', 'rainfall')
    url.searchParams.set('_limit', '10000')
    url.searchParams.set('startdate', params.startdate)
    url.searchParams.set('enddate', params.enddate)
    const res = await fetch(url.toString())
    if (!res.ok) throw new ReadingFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
    const data = (await res.json()) as EAReadingsResponse
    readings = data.items.flatMap((r) => {
      const n = normalise(r)
      return n ? [n] : []
    })
  } else {
    // Multi-day: one parallel call per calendar day (capped at 28 calls).
    // Each day's 10k gives ~1000 stations × ~10 readings from the early morning window.
    // Together they cover all active stations across the full period.
    const sampled = dates.length <= 28
      ? dates
      : dates.filter((_, i) => i % Math.ceil(dates.length / 28) === 0)
    const pages = await Promise.all(sampled.map(fetchDayReadings))
    readings = pages.flat()
  }

  if (params.fromMs !== undefined) {
    return readings.filter((r) => new Date(r.dateTime).getTime() >= params.fromMs!)
  }
  return readings
}

// Per-station totals for the last 6/24 h, computed by the /api/rainfall-totals
// Vercel function (the bulk EA endpoint is too slow/paginated to do in-browser).
export async function fetchRecentTotals(hours: 6 | 24): Promise<Map<string, number>> {
  const res = await fetch(`/api/rainfall-totals?hours=${hours}`)
  if (!res.ok) throw new ReadingFetchError(res.status, `Totals API error: ${res.status}`)
  const body = (await res.json()) as { totals: Record<string, number> }
  return new Map(Object.entries(body.totals))
}
