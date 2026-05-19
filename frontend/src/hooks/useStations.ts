import { useQuery } from '@tanstack/react-query'
import type { FeatureCollection } from 'geojson'
import { getStations } from '../services/db/stationStore'
import type { Station } from '../services/api/stationService'

function toGeoJSON(stations: Station[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.long, s.lat] },
      properties: {
        id: s.id,
        label: s.label,
        eaAreaName: s.eaAreaName,
        rainfall_mm: 0,
      },
    })),
  }
}

export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: getStations,
    select: toGeoJSON,
    staleTime: Infinity,
  })
}
