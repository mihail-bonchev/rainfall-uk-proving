import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'

async function fetchAreasGeoJSON(): Promise<FeatureCollection> {
  const res = await fetch('/data/ea-areas.geojson')
  if (!res.ok) throw new Error(`Failed to fetch EA areas: ${res.status}`)
  return res.json() as Promise<FeatureCollection>
}

export function useEAAreas() {
  return useQuery({ queryKey: ['ea-areas'], queryFn: fetchAreasGeoJSON, staleTime: Infinity })
}
