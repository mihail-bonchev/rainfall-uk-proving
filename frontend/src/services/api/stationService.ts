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
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
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

// The EA API no longer reports meta.totalCount, so page until a page adds no
// new stations (an empty page past the end, or a repeated page).
const MAX_PAGES = 20

export async function fetchAllStations(): Promise<Station[]> {
  const byId = new Map<string, Station>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const { items } = await fetchPage(page * PAGE_SIZE)
    const before = byId.size
    for (const raw of items) {
      if (typeof raw.lat !== 'number' || typeof raw.long !== 'number') continue
      byId.set(raw.stationReference, normalise(raw))
    }
    if (items.length === 0 || byId.size === before) break
  }
  return [...byId.values()]
}
