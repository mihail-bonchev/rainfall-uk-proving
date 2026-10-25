# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rainfall Explorer — a full-screen, interactive web app visualising real-time and historical rainfall data from ~1,000 UK Environment Agency monitoring stations. Visual quality target: Windy/Ventusky, not the DEFRA sample apps.

Data source: [EA Flood Monitoring API](https://environment.data.gov.uk/flood-monitoring/doc/rainfall)

## Current State (as of May 2026)

Epics 1–7 are complete and the app is deployed at [rain.xelantis.com](https://rain.xelantis.com).

- **Epics 1–6** (Foundation, Stations, Zoom layers, Live data, Station panel, Short-term historical up to 28d via EA API) are complete.
- **Epic 7** (Supabase + ingest pipeline) is live: `7d` and `28d` time ranges now query Supabase `station_daily_totals` directly. Supabase holds daily totals from 29 Oct 2025 onwards for England and Scotland (the EA archive keeps only ~1 year). The Railway cron job (`ingest/cron.js`) runs **every 15 minutes**: it refreshes 6h/24h per-station totals in `recent_totals` and fills any of the last 7 days missing from `station_daily_totals`. **EA publishes each day's archive ~22:20 UTC the following day**, so the newest available day is usually 2 days old — a 404 for a recent date is normal, not an error.
- **Epic 8** (Period vs historic averages) is Phase 3 — not yet started.
- `3 months` preset is live (#80). `1 year` needs a longer England backfill first (#81).

See [spec/implementation-plan.md](spec/implementation-plan.md) for the full epic/story breakdown.

## Tech Stack

### Frontend
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 + TypeScript + Vite 8 | |
| Map | MapLibre GL JS + react-map-gl v8 | NOT Leaflet |
| Tiles | Carto dark-matter (BBC style) / OpenFreeMap positron (Met Office style) | Free, no API key; recoloured to two tones in `utils/basemap.ts` |
| UI components | shadcn/ui (Nova preset) + Tailwind CSS v4 | `Sheet` for slide-in panel |
| Charts | Recharts (shadcn Chart wrapper) | |
| State/data | TanStack Query v5 + IndexedDB (idb) | |
| Time controls | Custom preset chips + shadcn DateRangePicker | |
| Colour scale | Two themes, toggled in UI: BBC continuous ramp (log-spaced on the Met Office band edges), Met Office 8 bands | `utils/rainfallScale.ts` — thresholds rescale per time range; dry is uncoloured in both |
| Historical DB | Supabase PostgreSQL | 7d/28d query `station_daily_totals` via Supabase JS client |
| Testing | Vitest + RTL + MSW + playwright-bdd + Playwright | See [spec/testing-strategy.md](spec/testing-strategy.md) |

### Ingest (Railway Cron)
| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js | `ingest_archive.js` — CommonJS |
| DB client | `@supabase/supabase-js` | Service role key for writes |
| CSV parsing | `csv-parse` | |
| Schedule | Railway Cron Job | `*/15 * * * *` → `node cron.js`; Node >=20 (`engines` in package.json) |

## Repository Structure

```
rainfall-uk-proving/
├── frontend/             # React app (Epics 1–7 complete)
│   ├── api/
│   │   └── rainfall-totals.ts # Vercel Function: per-station 6h/24h totals (CDN-cached)
│   ├── src/
│   │   ├── App.tsx / main.tsx
│   │   ├── components/        # Map layers, panels, controls, legend
│   │   │   └── ui/            # shadcn components
│   │   ├── hooks/
│   │   │   ├── useLatestReadings.ts    # 15m/custom → EA API; 6h/24h → /api/rainfall-totals; 7d/28d → Supabase
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
│   ├── cron.js           # Railway cron entry point (every 15 min): recent totals + archive gap fill + daily stations refresh
│   ├── stations.js       # EA stations → Supabase stations (≤ once/24 h; EA area by point-in-polygon)
│   ├── sepa_daily.js     # SEPA calendar-day totals → station_daily_totals (gap fill / --from --to backfill)
│   ├── providers/sepa.js # SEPA KiWIS adapter (Scotland): stations, latest 15-min, hourly totals, calendar days
│   ├── fixtures/sepa/    # Recorded (trimmed) KiWIS responses for unit tests
│   ├── recent_totals.js  # 6h/24h per-station totals → Supabase recent_totals
│   ├── recent_totals.sql # One-off table + RLS setup for recent_totals
│   ├── stations.sql      # One-off stations table + get_stations() RPC
│   ├── ingest_archive.js # Daily archive CSV → station_daily_totals (also runnable alone)
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

node cron.js                        # what Railway runs: recent totals + archive gap fill
node recent_totals.js               # refresh 6h/24h totals only
node stations.js [--force]          # refresh the stations table (skips if < 24 h old unless --force)
node sepa_daily.js                  # fill missing SEPA daily totals in the last 7 settled days
node sepa_daily.js --from 2026-05-01 --to 2026-10-14   # SEPA backfill (31-day chunks, one KiWIS call each)
node ingest_archive.js              # fill any gaps in the last 7 days (skips unpublished days)
node ingest_archive.js --date 2026-05-01   # ingest a specific date
node backfill.js --days 60          # backfill last 60 days
node backfill.js --from 2026-01-01 --to 2026-05-01  # explicit range

npm test                            # unit tests (node --test)
npm run test:smoke                  # live SEPA KiWIS contract check (network)
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
- Archive: daily CSVs at `/archive/readings-full-YYYY-MM-DD.csv` (~146 MB each). **Rolling window of roughly one year** — on 18 Oct 2026 the earliest file was 2025-10-29 (2026-01-28 missing). A day not ingested before it ages out is **lost for good**, so never let the cron be down for long.
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
- Populated from **29 Oct 2025** (England and Scotland; earliest EA archive available, backfilled in #81; 2026-01-28 missing for England); England grows by one day ~2 days late (EA archive lag), Scotland the next morning
- England and Scotland share this table: gap checks must filter by provider (`ingest_archive.js` counts only non-`sepa:` rows — counting all rows made the EA step skip days once SEPA rows landed first)
- Frontend queries via Supabase JS client with `anon` key (read-only RLS)

### Supabase / PostgREST gotchas — read before touching DB queries

**1. NUMERIC columns come back as strings.**
PostgREST serialises PostgreSQL `NUMERIC`/`DECIMAL` as JSON strings, not numbers. `0 + '1.20'` in JavaScript is `'01.20'` (string concat), not `1.20`. Always coerce: `Number(row.total_mm)`. This applies to aggregate results too.

**2. PostgREST default row limit is 1,000.**
A plain `.select()` on `station_daily_totals` for a 28-day window needs ~25,200 rows (900 stations × 28 days) but PostgREST silently returns only the first 1,000. Never query raw station-day rows from the frontend — use the RPC instead.

**3. Use the `get_station_totals` RPC for 7d/28d/3m aggregation — and page it.**
The function runs `SELECT station_ref, SUM(total_mm) … GROUP BY station_ref` server-side and returns one row per station. **With Scotland that is ~1,210 rows — over the 1,000 cap, which applies to RPC results too** (an unpaged call silently returned exactly 1,000). `useHistoricalReadings.ts` pages it: `.rpc('get_station_totals', …).order('station_ref').range(from, from + 999)` until a short page. Prefer RPCs that return one JSON value (like `get_stations`) for anything new.

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

- **Rainfall surface** (`RainfallSurface.tsx` + `utils/rainfallSurface.ts`): station totals are interpolated client-side onto a Web-Mercator grid covering Great Britain (`SURFACE_BOUNDS` −8.8…2.0°E, 49.7…61.0°N; 376-cell width, drawn at 3×; Gaussian-tapered inverse-distance weights, ~9 km σ, 25 km cutoff, distances use each point's own latitude), painted to a canvas, clipped to the nations with data (`NATIONS_WITH_DATA` = England, Scotland) from `public/data/uk-countries.geojson` (ONS Countries Dec 2023 BUC, OGL — attribution shown on the map) and shown as a MapLibre `image` source **below the basemap labels**. `NoDataSource.tsx` shades the other nations (Wales, NI) grey so they never read as dry; the legend says "No data yet". Gauges with no reading are faded grey dots; areas with no reporting gauge are left out of the regional summary. Coverage fades out where no station is near. A neighbour "buddy check" (`removeOutliers`) drops stuck/zero gauges from the surface so they don't paint bullseyes; isolated gauges (< 3 neighbours in 25 km — ~13% of SEPA's) are judged against a 50 km ring with looser limits (~8 Highland gauges remain too remote to judge). Hover shows the interpolated mm.
- **Do not use MapLibre `heatmap` layers for rainfall** — they visualise station *density*, not rainfall amount (that was the cause of the old "England glows green" problem).
- **Station dots** (zoom 7+): clickable, coloured on the same scale → shadcn Sheet panel.
- **Themes**: `bbc` (dark; continuous ramp deep blue → bright blue → cyan → green/yellow, brighter = wetter, interpolated in log space between the same band edges as Met Office so small totals keep contrast) and `metoffice` (light, 8 radar bands). Dry (< `floor`) is transparent in both. A linear 0..max BBC ramp was tried and rejected — everything landed in its palest sliver. `MapGL` is remounted (`key={theme}`) on toggle; the view is preserved.
- Default view fits Cornwall → Shetland (`DEFAULT_VIEW` in `App.tsx`). Zoom limited to 4.5–11.

Table: `stations` (created by `ingest/stations.sql`, issue #77)

- One row per rain gauge from every provider: `station_ref` (PK — EA refs bare to match `station_daily_totals`; others prefixed, e.g. `sepa:14897`), `provider`, `nation`, `region`, `label`, `lat`, `long`, `grid_ref`, `updated_at`
- Read via `supabase.rpc('get_stations')`, which returns **one JSON array** — safe past PostgREST's 1,000-row cap (verified with 1,100 rows)
- anon: SELECT only (writes rejected with 42501); cron writes with the service key
- Refreshed by `ingest/stations.js` per provider, each at most once a day (a provider returning 0 stations is treated as an error, never a wipe). SEPA: ~283 gauges that reported in the last 7 days, `nation = region = 'Scotland'`. EA: ~1,039 gauges; `region` = EA area via point-in-polygon against the site's `/data/ea-areas.geojson`. EA gauges outside every EA area (7, upper Severn/Wye) get `nation = 'Wales'`, `region = NULL`. Gauges the EA stops listing are deleted.

Table: `recent_totals` (created by `ingest/recent_totals.sql`)

- Two rows: `hours` = 6 and 24, each with `computed_at`, `station_count` and `totals` (JSONB `{ station_ref: mm }`) — EA refs bare, Scottish refs `sepa:…`
- EA is required (if it fails nothing is written). SEPA is best effort: on failure the previous `sepa:*` values are carried over and the run exits 1. SEPA windows are whole hours (hourly totals ending in the window), EA's are 15-min steps.
- One row per window keeps the read to a single row — no PostgREST 1,000-row limit
- anon has SELECT via RLS policy; cron writes with the service key

## Key Data Contracts

- Station: `{ id, label, lat, long, region, gridReference }`
- Latest reading: `{ value, dateTime, measure, fetched_at }`
- Supabase row: `{ date, station_ref, total_mm, reading_count }`

## Time Range → Data Source Mapping

| Range | Source | Status |
|---|---|---|
| 15m | EA API `?latest` + SEPA KiWIS value layer (browser, best effort, values ≤ 2 h old) | Live |
| 6h, 24h | Supabase `recent_totals` (refreshed every 15 min by cron); falls back to Vercel Function `/api/rainfall-totals` if missing or >1 h old | Live |
| 7d, 28d, 3m | Supabase `station_daily_totals` via `get_station_totals` (3m = 90 days; station panel shows weekly bars) | Live |
| custom | EA API `startdate`/`enddate` (≤28d) | Live |
| 1 year | Supabase (needs ≥ 365 days backfilled, #81) | Planned |
| Period vs average | Met Office 1991–2020 baseline | Phase 3 |

## Rainfall Colour Scales (`utils/rainfallScale.ts`)

Single source of truth for surface, station dots and legend. Per time range: `floor` (below = transparent/dry), `bounds` (7 Met Office band edges) and `max` (top of the BBC ramp). Custom ranges pick the 24h/7d/28d scale by length.

| Range | floor | Met Office bounds (mm) | BBC max |
|---|---|---|---|
| 15m | 0.05 | 0.2 0.5 1 2 3 5 8 | 5 |
| 6h | 0.1 | 0.5 1 2 4 8 16 32 | 30 |
| 24h | 0.2 | 1 2 4 8 16 32 64 | 50 |
| 7d | 0.5 | 2 5 10 20 40 80 160 | 80 |
| 28d | 1 | 5 10 25 50 100 200 300 | 200 |
| 3m | 2 | 25 50 100 150 250 400 600 | 400 |

## Known data limitations

- The EA bulk `/data/readings` endpoint caps at 10,000 readings per request and rejects `since=`. Unsorted, one request covers only ~130 stations. With `_sorted` it returns **newest-first across all stations**, which `api/rainfall-totals.ts` uses to page back only to the window start (~3 pages for 6h, ~10 for 24h). A fresh computation takes ~40–90 s when the EA API is slow, so the response is CDN-cached (`s-maxage=600, stale-while-revalidate=3600`). `vercel.json` sets `maxDuration: 300` and excludes `/api` from the SPA rewrite.
- On app load, `useRecentTotalsWarmup` (in `useLatestReadings.ts`) starts fetching 6h/24h in the background so they're usually ready when clicked; their chips show a spinner (dimmed if not selected) plus a "Collecting readings…" caption until first data arrives.
- **Custom ranges** still use the old in-browser bulk fetch and are under-sampled (~130 stations).
- In `npm run dev`, Vite proxies `/api` to the production site (Vite can't run Vercel functions); use `vercel dev` to run the function locally.
- The station panel fetches the clicked station's own readings from the EA (`fetchStationReadings`) for live ranges.
- **Stations load from Supabase** (`fetchStationsFromSupabase` → `get_stations` RPC, one call, EA areas pre-assigned) and are cached in IndexedDB for 24 h (`stationsLastFetched_v4`). If Supabase fails or is empty, `stationStore` falls back to paging the EA API + browser-side area assignment (slow). The EA `/id/stations` endpoint no longer returns `meta.totalCount`; both the fallback and `ingest/stations.js` page until a page adds nothing new.

## SEPA (Scotland) — KiWIS

- Base: `https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json` — no key, OGL ("Contains SEPA data © SEPA"), CORS `*`. The legacy `www2.sepa.org.uk/rainfall/api` is **retired**.
- Every call covers all ~300 gauges: `getTimeseriesList` (stations), `getTimeseriesValueLayer` (latest 15-min), `getTimeseriesValues&ts_path=1/*/RE/Hour.Total` (hourly; add `metadata=true&md_returnfields=station_no`).
- **Timestamps mark the END of the interval** (Hour.Total stamped 23:00 = 22:00–23:00), like EA readings. Calendar day D = hours ending in (D 00:00, D+1 00:00]. Don't use `HDay.Total` (09:00–09:00 hydrological day).
- Station refs are `sepa:<station_no>`.
- Daily totals (`sepa_daily.js`): day D written once D+1 is 2 h old; a gauge needs ≥ 20 hourly values that day or it's left out (no data, not a low total). `reading_count` = hours.

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
| Ingest cron | Railway | Cron Job `*/15 * * * *`; runs `npm start` → `node cron.js` (start command + builder set in the Railway dashboard; Config as Code `railway.toml` removed — deprecated, unsupported after 2026-12-01) |
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
