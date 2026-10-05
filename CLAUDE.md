# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rainfall Explorer — a full-screen, interactive web app visualising real-time and historical rainfall data from ~1,000 UK Environment Agency monitoring stations. Visual quality target: Windy/Ventusky, not the DEFRA sample apps.

Data source: [EA Flood Monitoring API](https://environment.data.gov.uk/flood-monitoring/doc/rainfall)

## Current State (as of May 2026)

Epics 1–7 are complete and the app is deployed at [rain.xelantis.com](https://rain.xelantis.com).

- **Epics 1–6** (Foundation, Stations, Zoom layers, Live data, Station panel, Short-term historical up to 28d via EA API) are complete.
- **Epic 7** (Supabase + ingest pipeline) is live: `7d` and `28d` time ranges now query Supabase `station_daily_totals` directly. Supabase holds daily totals from early May 2026 onwards. The Railway cron job (`ingest_archive.js`) runs daily at 05:00 UTC and fills any of the last 7 days missing from Supabase. **EA publishes each day's archive ~22:20 UTC the following day**, so the newest available day is usually 2 days old — a 404 for a recent date is normal, not an error.
- **Epic 8** (Period vs historic averages) is Phase 3 — not yet started.
- `3 months` and `1 year` presets are not yet wired up (Phase 3).

See [spec/implementation-plan.md](spec/implementation-plan.md) for the full epic/story breakdown.

## Tech Stack

### Frontend
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 + TypeScript + Vite 8 | |
| Map | MapLibre GL JS + react-map-gl v8 | NOT Leaflet |
| Tiles | OpenFreeMap vector tiles | Free, no API key |
| UI components | shadcn/ui (Nova preset) + Tailwind CSS v4 | `Sheet` for slide-in panel |
| Charts | Recharts (shadcn Chart wrapper) | |
| State/data | TanStack Query v5 + IndexedDB (idb) | |
| Time controls | Custom preset chips + shadcn DateRangePicker | |
| Colour scale | Met Office blue→cyan→green→yellow→orange→red | MapLibre `step` expression |
| Historical DB | Supabase PostgreSQL | 7d/28d query `station_daily_totals` via Supabase JS client |
| Testing | Vitest + RTL + MSW + playwright-bdd + Playwright | See [spec/testing-strategy.md](spec/testing-strategy.md) |

### Ingest (Railway Cron)
| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js | `ingest_archive.js` — CommonJS |
| DB client | `@supabase/supabase-js` | Service role key for writes |
| CSV parsing | `csv-parse` | |
| Schedule | Railway Cron Job | Daily at 05:00 UTC; Node >=20 (`engines` in package.json) |

## Repository Structure

```
rainfall-uk-proving/
├── frontend/             # React app (Epics 1–7 complete)
│   ├── src/
│   │   ├── App.tsx / main.tsx
│   │   ├── components/        # Map layers, panels, controls, legend
│   │   │   └── ui/            # shadcn components
│   │   ├── hooks/
│   │   │   ├── useLatestReadings.ts    # Routes 15m/6h/24h/custom → EA API; 7d/28d → Supabase
│   │   │   ├── useHistoricalReadings.ts # Supabase query for 7d / 28d
│   │   │   ├── useRegionalSummary.ts
│   │   │   └── useStations.ts
│   │   ├── services/
│   │   │   ├── api/           # EA API — readingService, stationService, historicalService
│   │   │   ├── aggregation/   # timeSeriesAggregator, regionalAggregator
│   │   │   └── db/            # IndexedDB (idb) + supabaseClient.ts
│   │   ├── smoke/             # EA API contract smoke tests (npm run test:smoke)
│   │   ├── utils/             # dateUtils, csvExport, rainfallAggregation
│   │   ├── types/api.ts
│   │   └── test/              # MSW handlers, setup, renderWithProviders
│   ├── e2e/                   # Playwright + Gherkin BDD
│   ├── vitest.config.ts       # Excludes *.smoke.test.ts and e2e/
│   ├── vitest.smoke.config.ts # Smoke test config — no MSW, node env, 30s timeout
│   ├── playwright.config.ts
│   └── package.json
├── ingest/               # Railway Cron — daily EA archive → Supabase
│   ├── ingest_archive.js # Main cron entry point (node ingest_archive.js)
│   ├── backfill.js       # One-shot backfill: node backfill.js --days 60
│   ├── ingest_archive.test.js
│   ├── package.json
│   ├── .env              # SUPABASE_URL + SUPABASE_SERVICE_KEY (gitignored)
│   └── .env.example
├── spec/                 # Design & planning docs
│   ├── high-level-specification.md
│   ├── architecture-and-implementation.md
│   ├── implementation-plan.md
│   └── testing-strategy.md
├── .github/workflows/ci.yml  # lint → test → build; optional smoke job (workflow_dispatch)
├── .gitignore
├── CLAUDE.md
└── README.md
```

## Running the Project

### Frontend
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run build
npm run preview
npm run lint

# Testing
npm run test           # Vitest watch (unit + behaviour)
npm run test:run       # Vitest single-pass (CI)
npm run test:coverage  # v8 coverage — 80% threshold enforced
npm run test:ui        # Vitest visual UI
npm run test:smoke     # EA API contract smoke tests (hits real API, ~30s)
npm run test:bdd       # Gherkin BDD scenarios (playwright-bdd)
npm run test:e2e       # All Playwright tests
```

### Ingest
```bash
cd ingest
npm install
cp .env.example .env   # fill in SUPABASE_URL + SUPABASE_SERVICE_KEY

node ingest_archive.js              # fill any gaps in the last 7 days (skips unpublished days)
node ingest_archive.js --date 2026-05-01   # ingest a specific date
node backfill.js --days 60          # backfill last 60 days
node backfill.js --from 2026-01-01 --to 2026-05-01  # explicit range

npm test                            # unit tests (node --test)
```

## Testing

Full strategy in [spec/testing-strategy.md](spec/testing-strategy.md). Summary:

| Layer | Tool | Command |
|---|---|---|
| Unit | Vitest + fake-indexeddb | `npm run test:run` |
| Behaviour (component) | Vitest + React Testing Library + MSW | `npm run test:run` |
| Smoke (EA API contract) | Vitest, real network, no MSW | `npm run test:smoke` |
| Gherkin BDD (E2E) | playwright-bdd + Playwright Chromium | `npm run test:bdd` |

**Key rules:**
- Colocate unit/behaviour tests with the file they test (`foo.ts` → `foo.test.ts`)
- Wrap components under test in `renderWithProviders()` from `src/test/utils.tsx`
- Mock MapLibre in component tests (`vi.mock('react-map-gl/maplibre', ...)`) — jsdom has no WebGL
- Add EA API mock handlers to `src/test/msw/handlers.ts`; override per-test with `server.use(...)`
- Smoke tests live in `src/smoke/` and use `vitest.smoke.config.ts` — no MSW, no jsdom
- Write Gherkin scenarios in `e2e/features/*.feature`; step definitions in `e2e/steps/`
- `.features-gen/` is gitignored — always regenerated by `bddgen`

## EA API Constraints

- Live API window: **4 weeks (28 days)** maximum
- Data freshness: every **15 minutes** per station
- ~1,000 active UK rainfall stations
- No regional aggregation endpoints — aggregate client-side
- Archive: daily CSVs at `/archive/readings-full-YYYY-MM-DD.csv`
- **`?since=` is NOT supported on `/data/readings` bulk endpoint** — use `startdate`/`enddate` instead
- Station metadata stable — cache indefinitely

## Supabase Schema

Table: `station_daily_totals`

```sql
CREATE TABLE station_daily_totals (
  date          DATE    NOT NULL,
  station_ref   TEXT    NOT NULL,
  total_mm      NUMERIC(8,2) NOT NULL,
  reading_count INTEGER NOT NULL,
  PRIMARY KEY (date, station_ref)
);
CREATE INDEX ON station_daily_totals (date);
```

- Populated by `ingest_archive.js` — one row per station per day
- Populated from early May 2026; grows by one day each morning (with a ~2-day publishing lag)
- Frontend queries via Supabase JS client with `anon` key (read-only RLS)

### Supabase / PostgREST gotchas — read before touching DB queries

**1. NUMERIC columns come back as strings.**
PostgREST serialises PostgreSQL `NUMERIC`/`DECIMAL` as JSON strings, not numbers. `0 + '1.20'` in JavaScript is `'01.20'` (string concat), not `1.20`. Always coerce: `Number(row.total_mm)`. This applies to aggregate results too.

**2. PostgREST default row limit is 1,000.**
A plain `.select()` on `station_daily_totals` for a 28-day window needs ~25,200 rows (900 stations × 28 days) but PostgREST silently returns only the first 1,000. Never query raw station-day rows from the frontend — use the RPC instead.

**3. Use the `get_station_totals` RPC for 7d/28d aggregation.**
The function runs `SELECT station_ref, SUM(total_mm) … GROUP BY station_ref` server-side and returns ~900 rows (one per station), well within any limit. It lives in `useHistoricalReadings.ts` as `supabase.rpc('get_station_totals', { p_start, p_end })`.

```sql
-- Definition (already created in Supabase):
CREATE OR REPLACE FUNCTION get_station_totals(p_start date, p_end date)
RETURNS TABLE(station_ref text, total_mm numeric)
LANGUAGE sql STABLE
AS $$
  SELECT station_ref, SUM(total_mm)
  FROM station_daily_totals
  WHERE date >= p_start AND date < p_end
  GROUP BY station_ref;
$$;
-- anon role has EXECUTE granted
```

## Map Architecture (Frontend)

Three layers driven by MapLibre zoom expressions (no React re-renders):

- **Zoom 5–7**: Regional choropleth (fill layer on EA region polygons)
- **Zoom 7–11**: Clustered station markers (native MapLibre GeoJSON clustering)
- **Zoom 11+**: Individual station circles (click → shadcn Sheet panel)

Cluster `clusterProperties` aggregate `rainfall_sum` so colour stays meaningful at all zoom levels.

## Key Data Contracts

- Station: `{ id, label, lat, long, region, gridReference }`
- Latest reading: `{ value, dateTime, measure, fetched_at }`
- Supabase row: `{ date, station_ref, total_mm, reading_count }`

## Time Range → Data Source Mapping

| Range | Source | Status |
|---|---|---|
| 15m | EA API `?latest` | Live |
| 6h, 24h | EA API `startdate`/`enddate` | Live |
| 7d, 28d | Supabase `station_daily_totals` | Live |
| custom | EA API `startdate`/`enddate` (≤28d) | Live |
| 3 months, 1 year | Supabase (presets not yet wired up) | Phase 3 |
| Period vs average | Met Office 1991–2020 baseline | Phase 3 |

## Heatmap Colour Thresholds (`PERIOD_MAX_MM`)

The value at which a station shows full red. Defined in **both** `StationsSource.tsx` and `RainfallLegend.tsx` — keep them exactly in sync.

| Range | Max mm | Rationale |
|---|---|---|
| 15m | 5 | Intense downpour threshold |
| 6h | 30 | Met Office Amber warning threshold |
| 24h | 50 | Met Office Amber/Red threshold |
| 7d | 100 | Autumn 2024 UK flood week benchmark |
| 28d | 250 | 1-in-50-year UK monthly total |
| custom | 50 | Matches 24h default |

## EA Areas (14 — `eaAreaName` field, NOT deprecated `eaRegionName`)

Thames, Herts and North London, Cumbria and Lancashire, East Midlands, Devon and Cornwall,
Wessex, Kent S London and E Sussex, Solent and South Downs, Lincs and Northants,
Yorkshire, Gtr Mancs Mersey and Ches, North East, East Anglia, West Midlands.

Area boundary GeoJSON (OGL v3, WGS84): download from `environment.data.gov.uk`.
Join key: `SHORT_NAME` on GeoJSON ↔ `eaAreaName` on station metadata.
See `spec/implementation-plan.md` for full download URL.

## Deployment

| Layer | Platform | Notes |
|---|---|---|
| Frontend | Vercel | Domain: `rain.xelantis.com`; **manual deploy — git push does NOT auto-deploy** |
| Archive cron | Railway | Cron Job; runs `node ingest/ingest_archive.js` daily at 05:00 UTC |
| Database | Supabase | PostgreSQL; anon key for reads, service key for cron writes |

### Deploying the frontend

Git push to `main` triggers CI (lint → test → build) but does **not** deploy to Vercel. Vercel is wired to the CLI, not GitHub auto-deploy. After pushing, always run:

```bash
cd frontend && vercel --prod
```

## Environment Variables

| File | Used by | Contains |
|---|---|---|
| `frontend/.env` | Vite / Vercel | `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, feature flags |
| `ingest/.env` | Railway cron | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |

Both are gitignored. Copy the `.env.example` in each subdirectory and fill in real values. Never put `SUPABASE_SERVICE_KEY` in the frontend.
