// SEPA (Scotland) KiWIS — called from the browser (CORS allowed, no key, OGL).
import type { Reading } from '../../types/api'

const SEPA_KIWIS = 'https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json'

// A gauge whose latest 15-min value is older than this is treated as not reporting.
const MAX_AGE_MS = 2 * 60 * 60 * 1000

interface LayerItem {
  station_no?: string
  timestamp?: string
  ts_value?: number | null
}

/** Latest 15-min rainfall for every recently-reporting SEPA gauge, keyed `sepa:<station_no>`. */
export async function fetchSepaLatest(nowMs = Date.now()): Promise<Map<string, number>> {
  const res = await fetch(
    `${SEPA_KIWIS}&request=getTimeseriesValueLayer&ts_path=1/*/RE/15m.Total&metadata=true&md_returnfields=station_no`,
  )
  if (!res.ok) throw new Error(`SEPA KiWIS error: ${res.status}`)
  const layer = (await res.json()) as LayerItem[]
  const out = new Map<string, number>()
  for (const x of layer) {
    if (!x.station_no || !x.timestamp || typeof x.ts_value !== 'number' || x.ts_value < 0) continue
    if (nowMs - Date.parse(x.timestamp) > MAX_AGE_MS) continue
    out.set(`sepa:${x.station_no}`, x.ts_value)
  }
  return out
}

export const isSepaRef = (ref: string) => ref.startsWith('sepa:')

/** One gauge's 15-min totals between two instants (timestamps mark the end of each interval). */
export async function fetchSepaStationReadings(ref: string, from: Date, to: Date): Promise<Reading[]> {
  const stationNo = ref.slice('sepa:'.length)
  const res = await fetch(
    `${SEPA_KIWIS}&request=getTimeseriesValues&ts_path=1/${encodeURIComponent(stationNo)}/RE/15m.Total` +
      `&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&returnfields=Timestamp,Value`,
  )
  if (!res.ok) throw new Error(`SEPA KiWIS error: ${res.status}`)
  const series = (await res.json()) as { data?: [string, number | null][] }[]
  return (series[0]?.data ?? [])
    .filter(([, v]) => typeof v === 'number' && v >= 0)
    .map(([dateTime, value]) => ({ stationRef: ref, dateTime, value: value as number }))
}
