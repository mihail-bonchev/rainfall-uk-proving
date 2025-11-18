# Plan: Rainfall Explorer Web App Implementation

Build a smart, efficient web application with an optimized local caching strategy: download and store all historical data once (from archives), cache live readings locally, and only fetch new data since last update. This eliminates redundant API calls while keeping current readings fresh.

## Steps

1. **Set up project foundation** with TypeScript, React, Vite, and configure local storage/IndexedDB for persistent data caching across sessions.

2. **Implement historical data import** by downloading daily CSV archives from `https://environment.data.gov.uk/flood-monitoring/archive` on first load or when user triggers update; parse and store all historical readings in IndexedDB indexed by station and date.

3. **Build station metadata layer** fetching static station list (`/id/stations?parameter=rainfall`) once and caching indefinitely; use geographic coordinates to populate map markers with region labels.

4. **Create live readings fetcher** that queries only new readings since last sync (`?since=<lastDateTime>`) to minimize API load; merge with cached historical data for complete time series.

5. **Implement time-series aggregation engine** supporting daily/weekly/monthly/custom-range views by querying local IndexedDB cache without hitting the API.

6. **Build map UI with station click-through** showing live reading + links to historical archives; add region grouping and filtering by geographic boundaries.

7. **Add component tests and API contract tests** using mock data from historical CSV archives to validate UI and data transformations.

## Further Considerations

1. **Historical data sync strategy**: Should users download all historical archives on first load (potentially large dataset), or download on-demand per station? Recommend **on-demand per region** to balance completeness with initial load time.

2. **IndexedDB vs localStorage**: localStorage has ~5-10MB limit; rainfall data could exceed this at scale. Recommend **IndexedDB** for larger capacity (typically 50MB+) and indexed queries.

3. **CSV archive parsing**: Archives contain all stations' data daily. Should you parse entire archive or filter by selected stations? Recommend **parse on-demand** (just requested stations/regions) to reduce processing.

4. **Update frequency for live readings**: Poll API every 15 minutes (aligned with data granularity) or less? Recommend **30s polling** for MVP responsiveness, cache aggressively to minimize requests.

## API Constraints & Key Insights

- Readings API limits to ~4 weeks of recent data in the live API
- Historical data archived daily as CSV files at `https://environment.data.gov.uk/flood-monitoring/archive/readings-{full-}{date}.csv`
- 15-minute intervals for rainfall data
- Data updates every 15 minutes from stations
- Individual reading URIs only valid for 28 days
- No continuous historical data available via API beyond 4 weeks
- Station metadata is stable and can be cached indefinitely
- Use `?since=<dateTime>` parameter to fetch only new readings since last sync
- ~1000 active rainfall monitoring stations across UK
- Station locations reduced to 100m grid for privacy reasons
