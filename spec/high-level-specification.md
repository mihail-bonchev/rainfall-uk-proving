TITLE: Rainfall Explorer – UK Environment Agency Rainfall Visualisation

GOAL:
Build a beautiful, interactive web app displaying real-time and historical rainfall from UK
Environment Agency monitoring stations. Inspired by Windy/Ventusky in visual quality,
not the plain DEFRA sample apps.

FEATURES:

1. Full-screen interactive map
   - OpenFreeMap vector tiles (free, no API key) via MapLibre GL JS
   - Centred on UK at load; smooth WebGL-powered zoom and pan
   - Legend card (floating, bottom-left)

2. Zoom-driven layer transitions (no button press required)
   - Zoom 5–7: National/regional choropleth — one fill per EA region coloured by
     average or cumulative rainfall over the selected time period
   - Zoom 7–11: Clustered station markers — native MapLibre GeoJSON clustering with
     aggregate rainfall shown on cluster badge
   - Zoom 11+: Individual station circles — colour and radius map to rainfall intensity

3. Rainfall colour scale (Met Office convention)
   - dry/trace: transparent
   - light: pale blue → cyan → green
   - moderate–heavy: yellow → orange → red
   - extreme: dark red / purple
   - Anomaly mode: diverging blue (wetter) ↔ white ↔ brown (drier)

4. Time range controls (floating bar, always visible)
   Presets: [15m] [6h] [24h] [7d] [28d] [3mo*] [1yr*] [Custom]
   (* Phase 2, requires backend)
   - Drives both map colours and all charts
   - Custom range: shadcn DateRangePicker with time-of-day precision for short ranges

5. Live / near-real-time data
   - EA API polling every 30s using ?since=<lastSyncTime>
   - Sync status: "Updated 12s ago" in header
   - Offline / API-down banner with graceful fallback to cached data

6. Station detail panel (shadcn Sheet, slides in from right)
   - Station name, region, grid reference, coordinates
   - Current reading (mm + timestamp + age)
   - Recharts time-series chart for the selected time range
   - External link to EA station page
   - "View in regional summary" button

7. Regional summary view
   - Table: Region | Period total (mm) | Avg per station | Station count
   - Recharts bar chart for comparison across regions
   - CSV export

8. Historical data (Phase 1: up to 28 days via EA API)
   - Aggregation: raw 15-min readings → daily / weekly / monthly totals
   - All time ranges drive the same map + table views

9. Long-term historical data (Phase 2: backend required)
   - Flask backend downloads and pre-aggregates EA archive CSVs daily
   - SQLite stores daily totals per station (compact: ~20MB for 2 years)
   - Year-range and custom-range queries served from backend

10. Period vs historic averages (Phase 3)
    - Baseline: Met Office 1991–2020 regional monthly averages
    - Anomaly map showing % deviation from baseline
    - Toggle between absolute (mm) and anomaly (%) view

TECHNICAL REQUIREMENTS:
- Map: MapLibre GL JS + react-map-gl v7
- Frontend: React 18 + TypeScript + Vite
- UI: shadcn/ui + Tailwind CSS
- Charts: Recharts (shadcn Chart wrapper)
- State: TanStack Query v5 + IndexedDB (idb)
- Backend: Flask (Python) for historical data pipeline
- Storage: SQLite for backend aggregates, IndexedDB for client cache
- Testing: Vitest + React Testing Library + MSW for API mocks
- Deployment: Vercel (frontend) + Render/Railway (Flask backend)
- Accessibility: WCAG 2.1 AA (keyboard nav, ARIA labels, contrast ≥ 4.5:1)

NON-FUNCTIONAL:
- Map load: < 2s
- Station click → panel: < 200ms
- Map FPS: 60 (WebGL)
- API poll latency: < 100ms
- Historical query (from IndexedDB or backend): < 500ms
- Mobile-first: full functionality on iOS 14+ / Android Chrome 90+
