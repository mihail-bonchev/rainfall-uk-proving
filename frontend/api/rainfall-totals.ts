// Vercel Function: per-station rainfall totals for the last 6 or 24 hours.
//
// The EA bulk /data/readings endpoint returns at most 10,000 readings per call
// and rejects `since=`; unsorted, a single call only ever saw ~130 stations.
// With `_sorted` it returns newest-first across all stations, so we page back
// only until the window start (~3 pages for 6h, ~10 for 24h) and return one
// total per station. The CDN caches the result so the EA API is hit rarely.

const EA_READINGS = 'https://environment.data.gov.uk/flood-monitoring/data/readings'
const PAGE_SIZE = 10_000
const PARALLEL_PAGES = 2
const MAX_PAGES = 16
const RETRIES = 3
// A 15-minute tipping-bucket reading above this is a gauge fault, not rain.
const MAX_PLAUSIBLE_15MIN_MM = 50

export const ALLOWED_HOURS = [6, 24] as const

export interface EAReading {
  value: number | null
  dateTime: string
  measure: string
}

export interface TotalsResult {
  hours: number
  from: string
  to: string
  stationCount: number
  totals: Record<string, number>
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export function stationRefFromMeasure(measure: string): string {
  const id = measure.split('/').pop() ?? ''
  const idx = id.indexOf('-rainfall-')
  return idx > 0 ? id.slice(0, idx) : ''
}

/** Adds readings inside (fromMs, toMs] into `totals`, keyed by station reference. */
export function accumulate(items: EAReading[], fromMs: number, toMs: number, totals: Record<string, number>): void {
  for (const r of items) {
    if (r.value == null || r.value < 0 || r.value > MAX_PLAUSIBLE_15MIN_MM) continue
    const t = Date.parse(r.dateTime)
    if (!(t > fromMs && t <= toMs)) continue
    const ref = stationRefFromMeasure(r.measure)
    if (!ref) continue
    totals[ref] = (totals[ref] ?? 0) + r.value
  }
}

async function fetchPage(fetchImpl: FetchLike, from: string, to: string, offset: number): Promise<EAReading[]> {
  const url = `${EA_READINGS}?parameter=rainfall&_sorted&startdate=${from}&enddate=${to}&_limit=${PAGE_SIZE}&_offset=${offset}`
  for (let attempt = 1; ; attempt++) {
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await fetchImpl(url)
    } catch (err) {
      // Dropped connections ("fetch failed") are transient on the EA API.
      if (attempt >= RETRIES) throw new Error(`EA API unreachable at offset ${offset}: ${(err as Error).message}`, { cause: err })
      await new Promise((r) => setTimeout(r, 1500 * attempt))
      continue
    }
    if (res.ok) return ((await res.json()) as { items?: EAReading[] }).items ?? []
    if (res.status < 500 || attempt >= RETRIES) throw new Error(`EA API ${res.status} at offset ${offset}`)
    await new Promise((r) => setTimeout(r, 1500 * attempt))
  }
}

/** Pages newest-first until the readings are older than the window start. */
async function fetchWindow(
  fetchImpl: FetchLike,
  fromMs: number,
  toMs: number,
  onPage: (items: EAReading[]) => void,
): Promise<void> {
  const from = new Date(fromMs).toISOString().slice(0, 10)
  const to = new Date(toMs).toISOString().slice(0, 10)
  for (let first = 0; first < MAX_PAGES; first += PARALLEL_PAGES) {
    const pages = await Promise.all(
      Array.from({ length: PARALLEL_PAGES }, (_, i) => fetchPage(fetchImpl, from, to, (first + i) * PAGE_SIZE)),
    )
    pages.forEach(onPage)
    const last = pages[pages.length - 1]
    // Only an empty page means the end: EA pages can come back a few items short.
    const reachedEnd = pages.some((p) => p.length === 0)
    const passedWindow = last.length > 0 && Date.parse(last[last.length - 1].dateTime) <= fromMs
    if (reachedEnd || passedWindow) return
  }
}

export async function computeTotals(hours: number, nowMs: number, fetchImpl: FetchLike): Promise<TotalsResult> {
  const fromMs = nowMs - hours * 3_600_000
  const totals: Record<string, number> = {}
  await fetchWindow(fetchImpl, fromMs, nowMs, (items) => accumulate(items, fromMs, nowMs, totals))
  for (const ref of Object.keys(totals)) totals[ref] = Math.round(totals[ref] * 100) / 100
  return {
    hours,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    stationCount: Object.keys(totals).length,
    totals,
  }
}

export async function GET(request: Request): Promise<Response> {
  const hours = Number(new URL(request.url).searchParams.get('hours'))
  if (!(ALLOWED_HOURS as readonly number[]).includes(hours)) {
    return Response.json({ error: `hours must be one of ${ALLOWED_HOURS.join(', ')}` }, { status: 400 })
  }
  try {
    const result = await computeTotals(hours, Date.now(), fetch)
    return Response.json(result, {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 })
  }
}
