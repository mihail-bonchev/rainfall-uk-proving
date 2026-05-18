# Rainfall Explorer – Complete Architecture & Implementation Specification

## Table of Contents
1. [Overview](#overview)
2. [Core Architecture](#core-architecture)
3. [Data Layer](#data-layer)
4. [Frontend Application](#frontend-application)
5. [Backend Service (Optional)](#backend-service-optional)
6. [Testing Strategy](#testing-strategy)
7. [Deployment & DevOps](#deployment--devops)
8. [Performance & Non-Functional Requirements](#performance--non-functional-requirements)

---

## Overview

**Project Name:** Rainfall Explorer – UK Environment Agency Rainfall Visualisation

**Vision:** A beautiful, full-screen map application showing UK rainfall in real time and across historical time ranges — quality comparable to Windy/Ventusky, not DEFRA sample apps.

**Target Users:** Environmental professionals, researchers, general public interested in UK rainfall patterns.

**Scope:**
- Phase 1 (MVP): Frontend-only, live + 28-day historical, MapLibre zoom transitions, station panel
- Phase 2: Flask backend pipeline for year-range historical data
- Phase 3: Anomaly map (period vs Met Office 1991–2020 baseline averages)

> **Note:** This document was updated in May 2026. The technology stack has changed
> significantly from the original spec. See the Technology Stack section for the current
> decisions and `spec/implementation-plan.md` for the story breakdown.

---

## Core Architecture

### Technology Stack

#### Frontend
- **Framework:** React 18+ with TypeScript
- **Build Tool:** Vite
- **Map Library:** **MapLibre GL JS + react-map-gl v7** (replaces Leaflet)
  - WebGL rendering: 60fps, smooth zoom, native GeoJSON clustering
  - Zoom-expression–driven layer transitions (no React re-renders)
  - Free/MIT, first-class TypeScript types
- **Tile Source:** **OpenFreeMap** (free vector tiles, no API key required)
- **UI Components:** **shadcn/ui + Tailwind CSS**
  - `Sheet` for slide-in station panel
  - `DateRangePicker` for custom time ranges
  - Zero runtime overhead (copy-paste components)
- **Data Management:** **TanStack Query v5** + **IndexedDB (idb library)**
- **Charts:** **Recharts** with shadcn Chart wrapper
- **Colour Scale:** Met Office convention — blue→cyan→green→yellow→orange→red
- **Testing:** Vitest + React Testing Library + MSW (API mocking)
- **Package Manager:** npm

#### Backend (Phase 2 — Historical Data Pipeline)
- **Runtime:** Python 3.11+
- **Framework:** Flask (already implemented in `app/`)
- **Scheduler:** APScheduler (daily archive download job)
- **Database:** SQLite (daily totals per station — ~20MB for 2 years)
- **Deployment:** Render or Railway

#### DevOps & Deployment
- **Frontend Hosting:** Vercel or Netlify
- **Backend Hosting (if needed):** Render, Railway, or AWS Lambda
- **Version Control:** Git + GitHub
- **CI/CD:** GitHub Actions

---

## Data Layer

### Data Sources

#### Primary: Environment Agency Flood Monitoring API
- **Base URL:** `https://environment.data.gov.uk/flood-monitoring`
- **Rate Limits:** Not publicly documented; recommend conservative polling (30s minimum)
- **Data Freshness:** Updates every 15 minutes from stations

#### Data Endpoints

| Endpoint | Purpose | Caching Strategy |
|----------|---------|------------------|
| `/id/stations?parameter=rainfall` | List all rainfall stations (~1000) | Cache indefinitely (12+ months), or update weekly |
| `/id/stations/{id}` | Single station metadata | Cache indefinitely after first fetch |
| `/id/measures?parameter=rainfall` | Available measures across all stations | Cache indefinitely after first fetch |
| `/id/measures/{id}/readings?since={dateTime}&_sorted&_limit=100` | New readings since last sync | Fetch every 30s, cache locally |
| `/data/readings?parameter=rainfall&latest&_limit=1000` | Latest reading per station | Use for fallback/validation only |
| **Archive:** `/archive/readings-{full-}{date}.csv` | Historical data archives | Download on-demand per region/date range |

### Local Data Storage Strategy

#### Storage Technology: IndexedDB
- **Capacity:** 50MB+ (browser-dependent; check available quota before storing)
- **Indexing:** By station ID, date, and measure ID for fast queries
- **Persistence:** Survives browser restarts; survives between sessions

#### Database Schema

```
ObjectStore: stations
  - Key: stationId (string)
  - Indexes: [eaRegionName, lat, long]
  - Data: { id, label, stationReference, lat, long, eaRegionName, gridReference, measures[] }

ObjectStore: readings
  - Key: [stationId, dateTime] (compound key)
  - Indexes: [stationId, date, stationId+date]
  - Data: { stationId, measureId, dateTime, date, value, unitName }

ObjectStore: syncMetadata
  - Key: syncId (string, e.g., "lastSyncTime", "stationsLastUpdated")
  - Data: { id, lastSyncTime, datasource }

ObjectStore: regions
  - Key: regionName (string)
  - Data: { name, stationIds[], bounds }
```

#### Data Flow

```
User Opens App
    ↓
Check IndexedDB for cached stations
    ├─ If expired (>7 days): Fetch from API → Update cache
    └─ If exists: Load from cache
    ↓
Load stations on map
    ↓
Poll API every 30s for new readings
    ├─ Query: ?since={lastSyncTime}&_sorted&_limit=100
    ├─ Store new readings in IndexedDB
    └─ Update UI
    ↓
User requests historical data for a region/station
    ├─ Check local cache first
    ├─ If missing: Trigger archive download (on-demand)
    ├─ Parse CSV, store in IndexedDB
    └─ Display aggregated data
```

### Archive Data Import

**When:** User explicitly requests historical data or on first app load (optional).

**How:**
1. User selects region and date range (e.g., "South East, last 6 months")
2. App calculates required archive dates
3. Downloads CSV archives from `https://environment.data.gov.uk/flood-monitoring/archive/readings-full-YYYY-MM-DD.csv`
4. Parses CSV, filters by selected region's stations
5. Stores in IndexedDB (deduplicated against existing data)
6. Shows progress indicator during download/parse

**CSV Format Example:**
```
dateTime, measure, value
2024-11-18T00:00:00Z, 52203-rainfall-tipping_bucket_raingauge-t-15_min-mm, 0.5
```

### Regional Grouping

**Pre-defined Regions** (based on Environment Agency regions):
- North East
- North West
- Yorkshire
- Midlands
- East Midlands
- Eastern
- South East
- South West
- Wales

Each region has a bounding box and list of station IDs. Queries aggregate readings by selected stations within a region.

---

## Frontend Application

### Project Structure

```
rainfall-uk-proving/
├── spec/
│   ├── high-level-specification.md
│   ├── architecture-and-implementation.md
│   └── api-contract.md (mock responses)
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── types/
│   │   ├── api.ts (Station, Reading, Measure types)
│   │   ├── ui.ts (Component props)
│   │   └── db.ts (IndexedDB schema)
│   ├── services/
│   │   ├── api/
│   │   │   ├── stationService.ts (Fetch stations)
│   │   │   ├── readingService.ts (Fetch readings with ?since)
│   │   │   └── archiveService.ts (Download & parse CSV)
│   │   ├── db/
│   │   │   ├── dbInit.ts (Initialize IndexedDB)
│   │   │   ├── stationStore.ts (Station queries)
│   │   │   ├── readingStore.ts (Reading queries)
│   │   │   └── syncStore.ts (Sync metadata)
│   │   ├── geo/
│   │   │   ├── regions.ts (Region definitions)
│   │   │   └── clustering.ts (Station clustering/grouping)
│   │   └── aggregation/
│   │       ├── timeSeriesAggregator.ts (Daily/weekly/monthly rollups)
│   │       ├── regionalAggregator.ts (By-region sums)
│   │       └── statistics.ts (Min/max/avg calculations)
│   ├── hooks/
│   │   ├── useStations.ts (Fetch & cache stations)
│   │   ├── useReadings.ts (Poll live readings, merge with history)
│   │   ├── useHistoricalData.ts (Aggregate historical data)
│   │   └── useMapInteraction.ts (Handle map clicks/panning)
│   ├── components/
│   │   ├── Map/
│   │   │   ├── RainfallMap.tsx (Main map container)
│   │   │   ├── StationMarker.tsx (Individual station marker)
│   │   │   ├── RegionLayer.tsx (Region overlay)
│   │   │   └── MapControls.tsx (Zoom, layer toggle, etc.)
│   │   ├── StationDetails/
│   │   │   ├── StationDetailsPanel.tsx (Click-through panel)
│   │   │   ├── LiveReadings.tsx (Current reading display)
│   │   │   ├── HistoricalLinks.tsx (Links to archives)
│   │   │   └── ReadingChart.tsx (Time-series sparkline)
│   │   ├── HistoricalData/
│   │   │   ├── HistoricalDataView.tsx (Container)
│   │   │   ├── TimeRangeFilter.tsx (Date picker + presets)
│   │   │   ├── RegionSelector.tsx (Multi-select regions)
│   │   │   ├── AggregationModeToggle.tsx (Daily/weekly/monthly/custom)
│   │   │   ├── DataTable.tsx (Display aggregated data)
│   │   │   └── ExportButton.tsx (CSV export)
│   │   ├── UI/
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Spinner.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── OfflineBanner.tsx (API downtime indication)
│   │   └── Layout/
│   │       ├── Header.tsx
│   │       ├── Sidebar.tsx
│   │       ├── Footer.tsx
│   │       └── ResponsiveLayout.tsx
│   ├── context/
│   │   ├── UIContext.tsx (Sidebar visibility, theme)
│   │   └── CacheContext.tsx (Cache status, sync state)
│   ├── utils/
│   │   ├── dateUtils.ts (Date formatting, range calculations)
│   │   ├── csvParser.ts (Parse archive CSVs)
│   │   ├── indexedDBUtils.ts (DB helpers)
│   │   ├── errorHandler.ts (Graceful error handling)
│   │   └── constants.ts (API URLs, poll intervals, etc.)
│   └── __tests__/
│       ├── components/
│       │   ├── Map.test.tsx
│       │   ├── StationDetailsPanel.test.tsx
│       │   ├── HistoricalDataView.test.tsx
│       │   └── ErrorBoundary.test.tsx
│       ├── services/
│       │   ├── stationService.test.ts
│       │   ├── readingService.test.ts
│       │   ├── archiveService.test.ts
│       │   └── stationStore.test.ts
│       ├── hooks/
│       │   └── useReadings.test.ts
│       └── utils/
│           ├── csvParser.test.ts
│           └── timeSeriesAggregator.test.ts
├── public/
│   └── tiles/ (Optional: offline map tiles, if available)
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── vitest.config.ts
├── package.json
└── README.md
```

### Key Features & User Flows

#### Feature 1: Map Display & Station Discovery
- **User Action:** Opens app
- **Expected Behavior:**
  1. Loads station list from cache or API
  2. Renders interactive map (Leaflet) centered on UK
  3. Displays rainfall station markers colored by live reading intensity (heatmap: green=low, yellow=moderate, red=high)
  4. Shows station count per region
  5. Supports pinch-zoom and smooth panning
- **Mobile Considerations:** Touch-friendly markers, auto-zoom on region click
- **Error Handling:** Show "Unable to load stations" message; offer retry button

#### Feature 2: Station Click-Through
- **User Action:** Clicks a station marker
- **Expected Behavior:**
  1. Opens side panel (or modal on mobile) with station details:
     - Station name/ID
     - Latest reading (timestamp + value in mm)
     - Recent readings sparkline (last 24h)
     - Links to Environment Agency historical archives
     - Link to download this station's CSV data
  2. Highlights selected station on map
  3. Shows nearby stations (radius-based)
- **Error Handling:** If live reading unavailable, show "No recent data" with last known reading timestamp

#### Feature 3: Historical Data Aggregation
- **User Action:** Opens "Historical Data" tab
- **Expected Behavior:**
  1. Allows selection of:
     - Region(s) from dropdown
     - Date range (presets: Last 7 days, Last 30 days, Last 6 months, custom)
     - Aggregation mode (Daily, Weekly, Monthly, Custom interval)
  2. Displays aggregated data:
     - Table: Date | Region | Total Rainfall (mm) | Avg Reading | Max Reading
     - Line chart (optional): Trend over time
  3. Supports export to CSV
- **Mobile Considerations:** Collapse filters into accordion; show table in horizontal scroll on narrow screens
- **Error Handling:** If data not cached, show "Downloading archives..." with progress bar; show partial results if some regions unavailable

#### Feature 4: Live Data Updates
- **Background Process:**
  1. App polls API every 30 seconds (configurable, respect user preferences)
  2. Query: `/id/measures/{measureId}/readings?since={lastSyncTime}&_sorted&_limit=100`
  3. Stores new readings in IndexedDB
  4. Updates UI in real-time (map markers refresh color, latest reading updates)
  5. Shows sync status in header (e.g., "Last updated: 30s ago")
- **Error Handling:** If API unavailable, shows banner "Data not updating – API offline"; continues serving cached data

#### Feature 5: Graceful Degradation
- **Offline Scenario:**
  1. User has no internet connection
  2. App detects and displays "Offline mode" banner
  3. Allows viewing cached stations and historical data
  4. Disables features requiring live API (live readings updates, new archive downloads)
- **API Downtime:**
  1. App detects repeated API failures (e.g., 3 consecutive 5xx errors)
  2. Displays warning banner: "Environment Agency API is currently unavailable"
  3. Continues serving cached readings (up to 28 days old)

### Component Specifications

#### RainfallMap.tsx
- Leaflet map with OpenStreetMap tiles (or Ordnance Survey if available)
- Custom marker colors based on reading intensity (scale: 0-50mm)
- Click handler → open StationDetailsPanel
- Hover shows station label
- Region overlay toggleable (optional)

#### StationDetailsPanel.tsx
- Slide-in panel (right side on desktop, full screen on mobile)
- Displays station name, ID, region, coordinates
- Latest reading (value + timestamp)
- Sparkline chart (last 24h readings)
- Links to:
  - Environment Agency official page (if available)
  - Archive download button
- "View Historical Data" button (pre-populates HistoricalDataView with this station)

#### HistoricalDataView.tsx
- Filter bar: Region selector, Date range picker, Aggregation mode
- Results table with sorting/pagination
- Optional line chart (recharts or similar)
- Export to CSV button

#### OfflineBanner.tsx
- Red/yellow banner at top
- Message: "API offline" or "Offline mode"
- Dismissible

### Styling & Responsive Design

- **Breakpoints:**
  - Mobile: < 640px (single column, full-width panels)
  - Tablet: 640px–1024px (2-column layout)
  - Desktop: > 1024px (3-column: map + side panel + history)
- **Color Scheme:** Minimal, modern
  - Primary: Blue (#0066cc)
  - Success: Green (#00aa00)
  - Warning: Yellow (#ffaa00)
  - Danger: Red (#cc0000)
  - Neutral: Grays
- **Typography:** System fonts (system-ui, -apple-system, etc.)
- **Spacing:** Tailwind defaults (4px baseline)

---

## Backend Service (Optional)

### Purpose
Reduce API load by caching Environment Agency responses and distributing aggregated data to multiple frontend clients.

### Architecture

```
Frontend Requests
    ↓
Backend Cache Service (Express.js)
    ├─ In-memory cache (Node) or Redis
    ├─ Request aggregation (batch similar requests)
    └─ API response decoration (add last-cached-time, TTL)
    ↓
Environment Agency API
```

### Endpoints

| Endpoint | Method | Purpose | Cache TTL |
|----------|--------|---------|-----------|
| `/api/stations` | GET | List all rainfall stations | 7 days |
| `/api/stations/:id` | GET | Single station metadata | 30 days |
| `/api/readings/latest` | GET | Latest reading per station | 30s |
| `/api/readings` | GET | Readings by station & date range | Variable (see below) |
| `/api/archives/list` | GET | Available archive dates | 1 day |

### Caching Strategy

| Data Type | TTL | Refresh Policy |
|-----------|-----|-----------------|
| Station metadata | 30 days | Manual refresh, or weekly scheduled |
| Latest readings | 30s | Poll API every 30s, invalidate on miss |
| Historical readings (bulk) | 24h | Cache entire day after it closes (midnight UTC) |
| Archives | 1 day | List available archives once daily |

### Request Deduplication
- If two clients request the same data within 5 seconds, serve from cache for second request
- Use request signature (endpoint + params) as cache key

---

## Testing Strategy

### Unit Tests

**Services:**
- `stationService.test.ts`: Mock API responses, test station fetching
- `readingService.test.ts`: Test `?since` parameter handling, response parsing
- `archiveService.test.ts`: Test CSV parsing, error handling
- `stationStore.test.ts`: Test IndexedDB queries (mock IndexedDB)
- `timeSeriesAggregator.test.ts`: Test daily/weekly/monthly aggregation logic

**Utils:**
- `csvParser.test.ts`: Test CSV parsing with various formats
- `dateUtils.test.ts`: Test date range calculations

### Component Tests

**Using React Testing Library:**
- `RainfallMap.test.tsx`: Mock Leaflet, test marker rendering and click handlers
- `StationDetailsPanel.test.tsx`: Test panel display with mock data
- `HistoricalDataView.test.tsx`: Test filter controls, table rendering
- `ErrorBoundary.test.tsx`: Test error display

### API Contract Tests

**Using mock responses from spec:**
- Validate that API responses match expected schema
- Test response parsing (e.g., CSV → JSON)
- Validate error scenarios (404, 500, timeout)

**Mock data files** (`spec/api-contract.md`):
```json
{
  "stations": [...],
  "readings": {...},
  "archiveRow": "2024-11-18T00:00:00Z, 52203-rainfall-tipping_bucket_raingauge-t-15_min-mm, 0.5"
}
```

### Integration Tests (Phase 2+)
- Backend cache service + frontend communication
- End-to-end: UI → Backend → Environment Agency API

### Test Coverage Goal
- **Frontend:** 80% coverage (exclude UI-only components)
- **Backend:** 85% coverage
- **Critical paths:** 100% (data fetching, aggregation, error handling)

---

## Deployment & DevOps

### Frontend Deployment

**Platform:** Vercel or Netlify

**Build Process:**
```bash
npm run build  # Vite builds to dist/
# Auto-deployed on git push to main
```

**Environment Variables:**
```
VITE_API_BASE_URL=https://environment.data.gov.uk/flood-monitoring
VITE_CACHE_EXPIRY_DAYS=7
VITE_POLL_INTERVAL_MS=30000
```

**Performance:**
- Lighthouse target: 90+ (all categories)
- Time to Interactive: < 2s on 4G
- First Contentful Paint: < 1.5s

### Backend Deployment (Phase 2)

**Platform:** Render or Railway

**Environment Variables:**
```
NODE_ENV=production
CACHE_TTL_SECONDS=30
ARCHIVE_CACHE_TTL_SECONDS=86400
```

**Health Checks:** `/health` endpoint returns `{ status: "ok", uptime: ... }`

### CI/CD Pipeline

**GitHub Actions Workflow:**
```yaml
on: [push, pull_request]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build

  deploy:
    if: github.ref == 'refs/heads/main'
    needs: [lint, test, build]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run build
      - uses: vercel/action@v4  # Or Netlify action
```

---

## Performance & Non-Functional Requirements

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Map load time | < 2s | Stations rendered |
| Station click → panel open | < 200ms | Smooth interaction |
| Historical data query (1 month) | < 500ms | From IndexedDB |
| Archive download (1 region, 1 month) | < 10s | Depends on network |
| API poll latency | < 100ms | 30s poll interval |
| Map panning/zoom frame rate | 60 FPS | Smooth on mobile |

### Availability & Reliability

- **Uptime Target:** 99.5% (frontend), 99% (optional backend)
- **Graceful Degradation:** All features degrade to cached data if API unavailable
- **Data Loss Prevention:** IndexedDB auto-backup (multiple browser sessions)
- **Error Recovery:** Automatic retry with exponential backoff (3 attempts, 1s/2s/4s intervals)

### Accessibility

- **WCAG 2.1 AA Compliance:**
  - Semantic HTML (nav, main, section, etc.)
  - ARIA labels for map markers and interactive elements
  - Keyboard navigation support (Tab through controls)
  - Color contrast ratio ≥ 4.5:1 (normal text)
  - Alt text for all images

### Security

- **API Communication:** HTTPS only
- **CSP (Content Security Policy):** Restrict external scripts
- **Sensitive Data:** No personal information stored; only anonymized station data
- **Dependencies:** Regular security audits (npm audit)

### Browser Support

- **Chrome/Edge:** Latest 2 versions
- **Firefox:** Latest 2 versions
- **Safari:** Latest 2 versions
- **Mobile:** iOS Safari 14+, Android Chrome 90+

---

## Summary of Design Decisions

1. **IndexedDB over localStorage:** Supports large datasets (50MB+) and indexed queries
2. **Frontend-only MVP:** Simplifies deployment, reduces infrastructure costs
3. **30s polling:** Balances data freshness with API load
4. **On-demand archive import:** Users download history only when needed
5. **Region-based grouping:** Matches Environment Agency boundaries; simplifies UI
6. **Leaflet over Mapbox:** Open-source, lightweight, sufficient for MVP
7. **Vite over Create React App:** Faster builds, smaller bundle size
8. **React Query:** Handles caching, invalidation, synchronization automatically

---

## Phases of Development

**Phase 1 (MVP):** Frontend-only, live map, station details, historical aggregation with CSV archive import
**Phase 2:** Backend cache service, improved performance
**Phase 3:** WebSocket for real-time updates, advanced analytics, data export formats
**Phase 4:** Mobile apps (React Native), offline-first PWA enhancements
