const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'
const PAGE_SIZE = 500

export interface Station {
  id: string
  label: string
  lat: number
  long: number
  eaAreaName: string
  gridReference: string
}

export class StationFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'StationFetchError'
  }
}

interface EAStation {
  stationReference: string
  label: string
  lat: number
  long: number
  eaAreaName?: string
  gridReference?: string
}

interface EAResponse {
  items: EAStation[]
  meta?: { totalCount?: number }
}

async function fetchPage(offset: number): Promise<EAResponse> {
  const url = `${EA_BASE}/id/stations?parameter=rainfall&_limit=${PAGE_SIZE}&_offset=${offset}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new StationFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<EAResponse>
}

function normalise(raw: EAStation): Station {
  return {
    id: raw.stationReference,
    label: raw.label,
    lat: raw.lat,
    long: raw.long,
    eaAreaName: raw.eaAreaName ?? '',
    gridReference: raw.gridReference ?? '',
  }
}

export async function fetchAllStations(): Promise<Station[]> {
  const first = await fetchPage(0)
  const stations = first.items.map(normalise)

  const total = first.meta?.totalCount ?? stations.length
  if (stations.length >= total) return stations

  const remaining = total - stations.length
  const pageCount = Math.ceil(remaining / PAGE_SIZE)
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => fetchPage((i + 1) * PAGE_SIZE)),
  )

  for (const page of pages) {
    stations.push(...page.items.map(normalise))
  }

  return stations
}
