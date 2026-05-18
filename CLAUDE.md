# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rainfall Explorer — a full-screen, interactive web app visualising real-time and historical rainfall data from ~1,000 UK Environment Agency monitoring stations. Visual quality target: Windy/Ventusky, not the DEFRA sample apps.

Data source: [EA Flood Monitoring API](https://environment.data.gov.uk/flood-monitoring/doc/rainfall)

## Current State (as of May 2026)

The **Flask backend** (data pipeline) is implemented in `app/`. The **React frontend does not yet exist** — there is no `src/`, `package.json`, or `index.html`. Phase 1 is to build the frontend from scratch.

See [spec/implementation-plan.md](spec/implementation-plan.md) for the full epic/story breakdown.

## Tech Stack

### Frontend (to be built — Phase 1)
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | |
| Map | MapLibre GL JS + react-map-gl v7 | NOT Leaflet |
| Tiles | OpenFreeMap vector tiles | Free, no API key |
| UI components | shadcn/ui + Tailwind CSS | `Sheet` for slide-in panel |
| Charts | Recharts (shadcn Chart wrapper) | |
| State/data | TanStack Query v5 + IndexedDB (idb) | |
| Time controls | Custom preset chips + shadcn DateRangePicker | |
| Colour scale | Met Office blue→cyan→green→yellow→orange→red | MapLibre `step` expression |
| Historical DB | Supabase PostgreSQL | Frontend queries via Supabase JS client; cron job writes |

### Backend (existing — Flask/Python)
- `app/` — Flask app; station proxy, latest readings cache, aggregation service
- `app/scripts/process_archive.py` — Download EA archive CSV → SQLite aggregation
- `data/` — SQLite DB (`agg_YYYY_MM_DD.sqlite`) and latest readings JSON cache

## Repository Structure

```
rainfall-uk-proving/
├── backend/              # Flask data pipeline
│   ├── app/              # Flask package
│   ├── data/             # SQLite DB + cache JSON (gitignored)
│   ├── run.py
│   └── requirements.txt
├── frontend/             # React app (Phase 1 — not yet built)
├── spec/                 # Design & planning docs
│   ├── high-level-specification.md
│   ├── architecture-and-implementation.md
│   └── implementation-plan.md
├── .env.example          # Frontend (VITE_*) env vars
├── .gitignore
├── .prettierrc
├── CLAUDE.md
├── eslint.config.js      # Frontend ESLint config (pre-created)
├── README.md
└── tsconfig.node.json    # Frontend TS config for Vite/Vitest (pre-created)
```

## Running the Project

### Backend
```bash
cd backend
pip install -r requirements.txt
python run.py          # http://localhost:5000
```
Sets `FLASK_ENV=development` for debug mode. Starts a background thread polling EA API for latest readings at 60s intervals.

### Frontend (once scaffolded in Phase 1)
```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
npm run build
npm run preview
npm run test
npm run test:coverage
npm run lint
```

## Backend API Endpoints

| Route | Description |
|---|---|
| `GET /api/stations` | All rainfall stations with coordinates and region |
| `GET /api/station-latest/<station_id>` | Most recent cached reading |
| `GET /api/station-total/<station_id>` | Aggregated daily total from SQLite |

## Backend Architecture

```
backend/
├── app/
│   ├── __init__.py           # create_app(); starts background poller; registers blueprint
│   ├── routes/main.py        # All HTTP endpoints (single Blueprint)
│   ├── scripts/
│   │   └── process_archive.py  # CSV archive → SQLite aggregation
│   └── services/
│       ├── station_service.py  # Proxies EA API — fetches all rainfall stations
│       ├── latest_service.py   # Daemon thread polls EA latest readings; in-memory + JSON cache
│       └── agg_service.py      # Reads pre-processed SQLite (data/agg_YYYY_MM_DD.sqlite)
├── data/                     # Generated files (gitignored)
│   ├── agg_YYYY_MM_DD.sqlite  # Pre-aggregated daily totals
│   └── latest_cache.json      # Persisted latest readings cache
└── run.py                    # Flask entry point
```

## EA API Constraints

- Live API window: **4 weeks (28 days)** maximum
- Data freshness: every **15 minutes** per station
- ~1,000 active UK rainfall stations
- No regional aggregation endpoints — aggregate client-side
- Archive: daily CSVs at `/archive/readings-full-YYYY-MM-DD.csv`
- `?since=<ISO8601>` parameter for incremental reads
- Station metadata stable — cache indefinitely

## Data Pipeline (Historical)

```bash
cd backend
# Download a daily readings CSV from the EA archive, then:
python app/scripts/process_archive.py
```

Fetches measure→station mapping, processes CSV (`data/readings-YYYY-MM-DD.csv`), writes `data/agg_YYYY_MM_DD.sqlite`. The date is currently hardcoded to 2025-11-21 in the script — update when processing a different day.

## Map Architecture (Frontend)

Three layers driven by MapLibre zoom expressions (no React re-renders):

- **Zoom 5–7**: Regional choropleth (fill layer on EA region polygons)
- **Zoom 7–11**: Clustered station markers (native MapLibre GeoJSON clustering)
- **Zoom 11+**: Individual station circles (click → shadcn Sheet panel)

Cluster `clusterProperties` aggregate `rainfall_sum` so colour stays meaningful at all zoom levels.

## Key Data Contracts

- Station: `{ id, label, lat, long, region, gridReference }`
- Latest reading: `{ value, dateTime, measure, fetched_at }`
- Aggregated total: `{ date, total, count }`

## Time Range → Data Source Mapping

| Range | Source |
|---|---|
| 15m, 6h, 24h, 7d, 28d | EA API (direct from frontend) |
| 3 months, 1 year | Supabase PostgreSQL (via Supabase JS client, Phase 2) |
| Period vs average | Met Office 1991–2020 baseline (Phase 3) |

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
| Frontend | Vercel | Domain: `rain.xelantis.com` |
| Archive cron | Railway | Cron Job; runs `ingest_archive.py` daily at 02:00 UTC |
| Database | Supabase | PostgreSQL; anon key for reads, service key for cron writes |

## Environment Variables

`.env.example` documents all vars. Frontend uses `VITE_`-prefixed vars. Backend reads `FLASK_ENV`.
