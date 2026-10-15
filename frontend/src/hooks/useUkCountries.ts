import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'

/** UK country outlines (ONS Countries Dec 2023, ultra-generalised, OGL) — `properties.name` = 'England' | 'Scotland' | 'Wales' | 'Northern Ireland'. */
async function fetchUkCountries(): Promise<FeatureCollection> {
  const res = await fetch('/data/uk-countries.geojson')
  if (!res.ok) throw new Error(`Failed to fetch UK countries: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

export function useUkCountries() {
  return useQuery({ queryKey: ['uk-countries'], queryFn: fetchUkCountries, staleTime: Infinity })
}

/** Nations with rainfall data on the map; the rest are shaded "no data yet". */
export const NATIONS_WITH_DATA = ['England', 'Scotland']
