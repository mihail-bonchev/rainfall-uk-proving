# Rainfall Explorer – Implementation Plan

## Context

The existing repo has a working Flask backend (data pipeline) and all config/spec files.
The React frontend does **not yet exist** — there is no `src/` or `package.json`.
This plan starts from that clean slate and does it properly.

---

## Key Tech Decisions (vs. old spec)

| Concern | Old plan | New decision | Why |
|---|---|---|---|
| Map library | Leaflet + react-leaflet | **MapLibre GL JS + react-map-gl** | WebGL rendering, native GeoJSON clustering with `clusterProperties`, zoom-expression–driven layer transitions, TS-first, free/MIT |
| Tile source | OpenStreetMap raster | **OpenFreeMap** vector tiles | Zero cost, no API key, MapLibre-compatible, smooth vector zoom |
| UI components | Plain Tailwind | **shadcn/ui + Tailwind** | `Sheet` for slide-in panel, DateRange picker, zero runtime deps |
| Charts | (Recharts planned) | **Recharts + shadcn Chart wrapper** | React-native, 49M dl/wk, consistent theming |
| Rainfall colour scale | green→red | **Met Office blue→cyan→green→yellow→orange→red** | Internationally legible, accessible, meteorologically conventional |
| Anomaly view | not planned | **Diverging blue↔brown** (wetter/drier than avg) | Required for "period vs historic averages" extra |
| Time control UX | date picker | **Preset chip strip + expandable custom range** | Grafana/Datadog pattern – reduces clicks for common ranges |
| State/data | React Query + IndexedDB | **TanStack Query v5 + IndexedDB (idb)** | Same pattern, updated deps |

---

## Data Constraints & Strategy

### EA Flood Monitoring API
- Live API: ~**4 weeks** of data maximum (28 days)
- Station metadata: stable, cache indefinitely
- Data freshness: every **15 minutes**
- No regional aggregation endpoints — all aggregation is client-side
- Rate limits: not documented; conservative polling (30s) recommended
- Archive: daily CSVs at `/archive/readings-full-YYYY-MM-DD.csv`
  - Each file: all stations, all readings for that day
  - ~10 MB uncompressed per day — impractical to download on client for year-range views

### Per-time-range coverage plan

| Range | Source | Phase |
|---|---|---|
| Last 15 min | EA API `?since=` | Phase 1 |
| Last 6h | EA API `?since=` | Phase 1 |
| Last 24h | EA API `?since=` | Phase 1 |
| Last 7 days | EA API `startdate/enddate` | Phase 1 |
| Last 28 days ("last month") | EA API `startdate/enddate` | Phase 1 |
| Last 3 months | Flask backend + SQLite | Phase 2 |
| Last year | Flask backend + SQLite | Phase 2 |
| Custom range | EA API (≤28d) or backend (>28d) | Phase 1/2 |
| Period vs average | Met Office monthly series + backend | Phase 3 |

---

## Map Zoom Level Architecture

Three visual layers driven purely by MapLibre style `interpolate`/`step` zoom expressions (no React re-renders):

```
Zoom 5–6.5: National overview
  └── Choropleth fill — one polygon per EA region, colour = average station reading
  └── Fade out at zoom 6.5→7.5

Zoom 7–10.5: Clustered stations
  └── MapLibre native GeoJSON clustering (clusterMaxZoom: 10)
  └── clusterProperties: { rainfall_sum, station_count }
  └── Cluster circle size ∝ count, colour ∝ rainfall_sum/station_count
  └── Fade in 6.5→7.5, fade out 10→11

Zoom 11+: Individual stations
  └── Individual circles, radius ∝ reading, colour = MetOffice rainfall scale
  └── Fade in 10→11
  └── Click → Sheet panel
```

---

## Epics & Stories

---

### Epic 1 — Project Foundation

**Goal:** Working dev environment with map + tiles rendering.

| # | Story | Acceptance criteria |
|---|---|---|
| 1.1 | Scaffold React + Vite + TypeScript project | `npm run dev` serves a page at localhost:5173 |
| 1.2 | Install + configure shadcn/ui, Tailwind CSS | `npx shadcn add button` works; Tailwind classes apply |
| 1.3 | Install MapLibre GL + react-map-gl, render UK-centred map | Map renders with OpenFreeMap vector tiles, centred on UK (lat 54, lon -2.5, zoom 6) |
| 1.4 | Install TanStack Query v5, configure QueryClient | DevTools visible in dev mode |
| 1.5 | Set up IndexedDB schema (idb library) | `stations`, `readings`, `syncMetadata` object stores created on first load |

---

### Epic 2 — Station Data Layer

**Goal:** ~1000 stations loaded from EA API, cached in IndexedDB, rendered on map.

| # | Story | Acceptance criteria |
|---|---|---|
| 2.1 | `stationService.ts` — fetch all rainfall stations from EA API | Returns array of `{id, label, lat, long, region}` |
| 2.2 | `stationStore.ts` — persist stations to IndexedDB, expiry 7 days | Cache hit on second load, no API call if fresh |
| 2.3 | Add stations as a GeoJSON `FeatureCollection` source to MapLibre | `console.log` shows ~1000 features loaded |
| 2.4 | Render station `circle` layer with basic blue colour | ~1000 circles visible on map |
| 2.5 | Apply Met Office rainfall colour scale via MapLibre `step` expression | Circle colours reflect dummy intensity values before live data |

---

### Epic 3 — Zoom-Driven Layer Transitions

**Goal:** Three-layer map that transitions automatically as the user zooms.

| # | Story | Acceptance criteria |
|---|---|---|
| 3.1 | Add EA region polygons as a GeoJSON source | 9 region polygons visible as toggle layer |
| 3.2 | Regional choropleth layer (zoom 5–7.5): colour by region average reading | Choropleth fills visible at zoom 6, faded at zoom 8 |
| 3.3 | MapLibre native clustering (zoom 7–11): clusters show count badge + colour | Clusters appear at zoom 8, expand as zoom increases |
| 3.4 | Individual station layer (zoom 11+): each circle clickable | Individual markers appear at zoom 11+, clusters gone |
| 3.5 | Zoom opacity transitions: smooth cross-fade between all layers | No visual pop/flash when crossing zoom thresholds |
| 3.6 | Click cluster → flyTo expansion zoom | Map flies to correct zoom/centre to show cluster contents |

---

### Epic 4 — Live Data & Time Controls

**Goal:** Live rainfall data displayed on map, controllable by a time range bar.

| # | Story | Acceptance criteria |
|---|---|---|
| 4.1 | `readingService.ts` — fetch latest reading per station (`?parameter=rainfall&latest`) | Returns `{stationRef, value, dateTime}[]` |
| 4.2 | `readingStore.ts` — persist readings to IndexedDB, merge by `[stationRef, dateTime]` | No duplicate readings stored |
| 4.3 | TanStack Query hook `useLatestReadings` — polls every 30s | Map colours update every 30s without page reload |
| 4.4 | Time range control UI — floating bar with preset chips: `15m · 6h · 24h · 7d · 28d · Custom` | Chips render at top of map, correct one highlighted on click |
| 4.5 | Time range drives `?since=` or `startdate/enddate` query parameters | API calls use correct date range for each preset |
| 4.6 | Map circle colours driven by selected time range aggregate (sum over period) | Selecting "6h" shows 6h cumulative total; colours update |
| 4.7 | Sync status indicator — "Updated Xs ago" | Header shows elapsed time since last successful poll |
| 4.8 | Offline/API error banner | Yellow banner on repeated API failure; map still renders cached data |

---

### Epic 5 — Station Detail Panel

**Goal:** Clicking a station opens a rich detail panel.

| # | Story | Acceptance criteria |
|---|---|---|
| 5.1 | shadcn `Sheet` panel slides in from right on station click | Panel opens/closes with CSS transition, no page navigation |
| 5.2 | Panel header: station name, region, grid reference, coordinates | All fields populated from cached station metadata |
| 5.3 | Current reading: value (mm), timestamp, data age | Shows "12.4 mm at 14:30" or "No recent data" |
| 5.4 | Recharts `LineChart` — last 24h readings as time series | Chart renders with correct time axis, handles gaps in data |
| 5.5 | Time range in panel respects global time control selection | Switching to "7d" in the top bar updates panel chart |
| 5.6 | "View historical data" button opens regional historical panel | Wires into Epic 6 |
| 5.7 | External link to EA station page | Opens `https://environment.data.gov.uk/flood-monitoring/id/stations/{id}` |
| 5.8 | Close panel on map click outside / Escape key | Standard Sheet dismiss behaviour |

---

### Epic 6 — Short-Term Historical (up to 28 days)

**Goal:** Map and table views for historical aggregation, powered by EA API.

| # | Story | Acceptance criteria |
|---|---|---|
| 6.1 | `historicalService.ts` — fetch readings by `startdate`/`enddate` for a station | Returns sorted `Reading[]` array |
| 6.2 | `timeSeriesAggregator.ts` — daily / weekly rollups from readings array | Unit-tested; correct sums, handles edge dates |
| 6.3 | `regionalAggregator.ts` — sum daily totals across all stations per EA region | Returns `{region, totalMm, avgMm, stationCount}[]` |
| 6.4 | Regional summary panel — table: Region | Total mm | Avg mm | Stations | Triggered from "Regions" button on map controls |
| 6.5 | Map choropleth (zoom 5–7) updates to show period total when time range > 24h | At "7d", regional fill colours represent 7-day cumulative |
| 6.6 | `CustomDateRange` component — shadcn DateRangePicker with presets | Custom range stored in query state, drives API calls |
| 6.7 | CSV export — download regional summary as `.csv` | File downloads with correct data on button click |

---

### Epic 7 — Long-Term Historical Backend (Phase 2)

**Goal:** Year-range queries and multi-year historical data served from Flask backend.

| # | Story | Acceptance criteria |
|---|---|---|
| 7.1 | Flask endpoint `GET /api/daily-totals?station=&from=&to=` | Returns pre-aggregated `{date, station_reference, total_mm, count}[]` from SQLite |
| 7.2 | Flask endpoint `GET /api/regional-totals?region=&from=&to=` | Aggregates daily totals by region from SQLite |
| 7.3 | `APScheduler` job — downloads yesterday's archive CSV daily at 02:00 UTC | New SQLite rows added each morning |
| 7.4 | Backfill script — download and process last 2 years of archive CSVs | SQLite has 2 years of daily totals; runs once manually |
| 7.5 | Frontend `useHistoricalData` hook — routes to backend for ranges > 28d | Hook transparently selects EA API or Flask backend based on date range |
| 7.6 | "Last 3 months" and "Last year" presets added to time control bar | Both presets fetch from Flask backend, map/table update correctly |
| 7.7 | Station detail panel chart extends to yearly view when backend available | LineChart shows weekly totals for year range |

---

### Epic 8 — Period vs Historic Averages (Phase 3)

**Goal:** Anomaly map showing whether a period was wetter/drier than historical norm.

| # | Story | Acceptance criteria |
|---|---|---|
| 8.1 | Ingest Met Office UK regional monthly averages (1991–2020 baseline) | Parsed and stored as static JSON in repo |
| 8.2 | `anomalyCalculator.ts` — compute % deviation from baseline for any period | Returns `{region, observed_mm, baseline_mm, anomaly_pct}[]` |
| 8.3 | Anomaly choropleth — diverging blue↔brown colour scale | Blue = wetter than average, brown = drier, white = average |
| 8.4 | "Compare to average" toggle on time control bar | Switches map between absolute and anomaly views |
| 8.5 | Legend card updates between absolute (mm) and anomaly (%) scales | Correct legend shown for each mode |

---

### Epic 9 — Quality, Testing & Deployment (Phase 1 + 2)

| # | Story | Acceptance criteria |
|---|---|---|
| 9.1 | Vitest + React Testing Library setup | `npm run test` runs; initial test suite passes |
| 9.2 | Unit tests for `timeSeriesAggregator`, `regionalAggregator`, `csvParser` | 80%+ line coverage on these modules |
| 9.3 | Component tests: `StationDetailPanel`, `TimeRangeControl`, `RegionalSummary` | Render + interaction tests with MSW mocked API |
| 9.4 | GitHub Actions CI: lint → test → build on every PR | CI passes on main branch |
| 9.5 | Vercel deployment (frontend) | `https://rainfall-uk.vercel.app` serves production build |
| 9.6 | Flask backend deployed to Render/Railway with environment variables | Backend API accessible at known URL |
| 9.7 | Mobile responsive pass: tablet and mobile layouts tested | Panel becomes bottom sheet on mobile; time bar collapses to icon |

---

## Phase Summary

| Phase | Epics | Deliverable |
|---|---|---|
| **Phase 1** | 1–6, 9 (partial) | Full-screen MapLibre map, live polling, zoom transitions, station panel, up to 28-day historical. Deployed. |
| **Phase 2** | 7, 9 (complete) | Backend historical pipeline, year-range views, fully tested. |
| **Phase 3** | 8 | Anomaly map (period vs average). |

---

## Open Questions

1. **Historic averages data source**: Met Office publishes regional monthly series at https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-and-regional-series — confirm this is adequate for the anomaly comparison or if a different source is preferred.
2. **Backend hosting**: Render / Railway free tier is fine for development. For production with scheduled jobs, a paid tier (~$7/mo) may be needed. Any preference?
3. **Domain**: Will this be deployed at a custom domain or Vercel/Netlify subdomain for now?
4. **Backfill depth**: 2 years of archive data is ~20MB SQLite (daily totals only). Worth going back further (e.g., 5 years)?
5. **EA Region polygons**: Exact GeoJSON for the 9 EA regions needs sourcing. Options: ONS Open Geography Portal, or derive from station coordinates. Confirm approach.
