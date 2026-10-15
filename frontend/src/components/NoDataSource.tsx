import { useMemo } from 'react'
import { Source, Layer } from 'react-map-gl/maplibre'
import { NATIONS_WITH_DATA, useUkCountries } from '../hooks/useUkCountries'
import { useFirstLabelLayerId } from '../hooks/useFirstLabelLayerId'
import type { MapTheme } from '../utils/rainfallScale'

const ONS_ATTRIBUTION = 'Boundaries: ONS (OGL v3), contains OS data © Crown copyright 2024'

/**
 * Shades UK nations we have no gauge data for (Wales, Northern Ireland) so they
 * never read as "dry" — on the dark style, dry areas are also plain map.
 */
export function NoDataSource({ theme }: { theme: MapTheme }) {
  const { data: countries } = useUkCountries()
  const labelLayerId = useFirstLabelLayerId()

  const noData = useMemo(
    () =>
      countries && {
        ...countries,
        features: countries.features.filter((f) => !NATIONS_WITH_DATA.includes(f.properties?.name)),
      },
    [countries],
  )

  if (!noData || !labelLayerId) return null

  return (
    <Source id="no-data-nations" type="geojson" data={noData} attribution={ONS_ATTRIBUTION}>
      <Layer
        id="no-data-nations"
        type="fill"
        beforeId={labelLayerId}
        paint={{
          'fill-color': theme === 'bbc' ? '#94a3b8' : '#64748b',
          'fill-opacity': theme === 'bbc' ? 0.22 : 0.28,
        }}
      />
    </Source>
  )
}
