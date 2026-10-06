import type { Reading } from '../../types/api'
import { getReadingsByStation, upsertReadings } from '../db/readingStore'
import { ReadingFetchError } from './readingService'

const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring'
const PAGE_SIZE = 500

interface EAReading {
  stationReference: string
  value: number | null
  dateTime: string
  measure: string
}

interface EAReadingsResponse {
  items: EAReading[]
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
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

// Always hits the EA API (no cache) — for live ranges where freshness matters.
export async function fetchStationReadings(stationRef: string, from: Date, to: Date): Promise<Reading[]> {
  const results: Reading[] = []
  let offset = 0

  while (true) {
    const url = new URL(`${EA_BASE}/data/readings`)
    url.searchParams.set('parameter', 'rainfall')
    url.searchParams.set('stationReference', stationRef)
    url.searchParams.set('startdate', toDateStr(from))
    url.searchParams.set('enddate', toDateStr(to))
    url.searchParams.set('_sorted', '')
    url.searchParams.set('_limit', String(PAGE_SIZE))
    if (offset > 0) {
      url.searchParams.set('_offset', String(offset))
    }

    const res = await fetch(url.toString())
    if (!res.ok) {
      throw new ReadingFetchError(res.status, `EA API error: ${res.status} ${res.statusText}`)
    }

    const data = (await res.json()) as EAReadingsResponse
    const page = data.items.flatMap((r) => {
      const n = normalise(r)
      return n ? [n] : []
    })
    results.push(...page)

    if (data.items.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return results
}

function coversFullRange(readings: Reading[], from: Date, to: Date): boolean {
  if (readings.length === 0) return false
  const sorted = [...readings].sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  const earliest = new Date(sorted[0].dateTime)
  const latest = new Date(sorted[sorted.length - 1].dateTime)
  const oneDayMs = 24 * 60 * 60 * 1000
  return earliest <= new Date(from.getTime() + oneDayMs) && latest >= new Date(to.getTime() - oneDayMs)
}

export async function fetchReadingsForStation(stationRef: string, from: Date, to: Date): Promise<Reading[]> {
  const cached = await getReadingsByStation(stationRef, from, to)
  if (coversFullRange(cached, from, to)) {
    return [...cached].sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  }

  const readings = await fetchStationReadings(stationRef, from, to)
  if (readings.length > 0) {
    await upsertReadings(readings)
  }
  return readings.sort((a, b) => a.dateTime.localeCompare(b.dateTime))
}
