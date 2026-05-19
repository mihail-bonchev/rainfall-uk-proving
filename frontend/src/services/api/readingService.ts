import type { Reading } from '../../types/api'
import type { DateRangeParams } from '../../utils/dateUtils'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'

interface EAReading {
  stationReference: string
  value: number | null
  dateTime: string
  measure: string
}

interface EAReadingsResponse {
  items: EAReading[]
}

export class ReadingFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ReadingFetchError'
  }
}

function normalise(raw: EAReading): Reading | null {
  if (raw.value == null || raw.value < 0) return null
  return {
    stationRef: raw.stationReference,
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

export async function fetchReadings(params: DateRangeParams): Promise<Reading[]> {
  const url = new URL(`${EA_BASE}/data/readings`)
  url.searchParams.set('parameter', 'rainfall')
  url.searchParams.set('_limit', '10000')
  if (params.since) {
    url.searchParams.set('since', params.since)
  } else if (params.startdate) {
    url.searchParams.set('startdate', params.startdate)
    url.searchParams.set('enddate', params.enddate!)
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new ReadingFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as EAReadingsResponse
  return data.items.flatMap((r) => {
    const n = normalise(r)
    return n ? [n] : []
  })
}
