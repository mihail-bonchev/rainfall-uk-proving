import { useMemo } from 'react'
import { aggregateByArea, type AreaSummary } from '../services/aggregation/regionalAggregator'
import type { Station } from '../services/api/stationService'

export function useRegionalSummary(
  readingsMap: Map<string, number>,
  stations: Station[],
): AreaSummary[] {
  return useMemo(() => aggregateByArea(readingsMap, stations), [readingsMap, stations])
}
