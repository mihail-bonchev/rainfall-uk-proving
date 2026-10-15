import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import { getStations } from '../services/db/stationStore'
import type { Station } from '../services/api/stationService'

export function toGeoJSON(
  stations: Station[],
  readingsMap: Map<string, number> = new Map(),
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.long, s.lat] },
      properties: {
        id: s.id,
        label: s.label,
        eaAreaName: s.eaAreaName,
        // null = no reading (offline gauge, or a provider not ingested yet) — never shown as dry.
        rainfall_mm: readingsMap.get(s.id) ?? null,
      },
    })),
  }
}

export function useStations() {
  return useQuery<Station[]>({
    queryKey: ['stations'],
    queryFn: getStations,
    staleTime: Infinity,
  })
}
