# Research: Extending Rainfall Explorer to all UK nations

*Status: research only, no code written yet. Prepared October 2026.*

## 1. Summary

The app currently covers **England only** because its single data source, the Environment Agency (EA) Flood Monitoring API, only has gauges in England. Covering the whole UK means adding three more agencies, each with its own API, licence and level of data maturity:

| Nation | Agency | Open real-time rainfall data? | Ease of adding | Recommendation |
|---|---|---|---|---|
| England | EA | Yes (already used) | n/a | Keep as is |
| **Scotland** | SEPA | **Yes.** Open (OGL), no registration, about 275 gauges, 15-min, hourly and daily totals | **Easy to moderate** | **Do first** |
| **Wales** | NRW | **Yes, but** you need an API key, the data is unvalidated, and the licence says *"not stored for more than 1 calendar year"* | **Moderate** | Do second. Check the storage clause with NRW first |
| **Northern Ireland** | DfI Rivers / NI Water | **No open rainfall API found.** DfI publishes river levels, not rainfall | **Hard (data does not exist openly)** | Show as "no open data" for now. Ask DfI / NI Water for a feed |

**Running costs barely change.** Database growth stays well inside the Supabase free tier, and the cron job does a few more HTTP calls every 15 minutes. **Expect £0–5/month extra.** The real cost is **developer time, about 4–6 weeks of one person for Scotland + Wales + UK-wide frontend work**, plus ongoing upkeep of three more upstream APIs.

## 2. What is England-specific today

From reading the code:

| Area | England-specific part | Files |
|---|---|---|
| Station list | EA `/id/stations`; `eaAreaName` is the only region field | `services/api/stationService.ts`, `services/db/stationStore.ts`, `hooks/useStations.ts` |
| 15m live | Browser calls EA `?latest` directly | `services/api/readingService.ts` |
| 6h / 24h | Cron pages the EA bulk `/data/readings`; Vercel fallback does the same | `ingest/recent_totals.js`, `frontend/api/rainfall-totals.ts` |
| 7d / 28d | Cron reads EA daily archive CSVs into `station_daily_totals` | `ingest/ingest_archive.js`, `ingest/backfill.js` |
| Custom range | Browser bulk-fetches the EA API | `services/api/historicalService.ts` |
| Station panel | Fetches the clicked station's readings from the EA | `components/StationDetailPanel.tsx` |
| Surface clip + regions | `public/data/ea-areas.geojson` (2.4 MB, England only) clips the surface and drives regional summaries | `components/EAAreasSource.tsx`, `hooks/useEAAreas.ts`, `services/aggregation/regionalAggregator.ts` |
| Map view | Default centre 53.0 N, zoom 5.6. Scotland's north and Shetland (about 60.8 N) are off-screen | `App.tsx` |
| Colour scales | Band edges tuned to English totals | `utils/rainfallScale.ts` |

The parts that work for any data source are the interpolated surface (`utils/rainfallSurface.ts`), the colour themes, the station dots and the `station_daily_totals` / `recent_totals` table shapes. These need extending, not rewriting.

## 3. Data sources by nation

### 3.1 Scotland: SEPA (good)

SEPA offers two interfaces:

1. **Legacy rainfall REST API** (`www2.sepa.org.uk/rainfall/api/...`). About 275 gauges, 15-minute totals, `/api/Stations` plus hourly and daily totals per station. Returns JSON, XML or CSV. **OGL, no registration.** It only keeps short history (about 7 days hourly, 1 year daily, 10 years monthly).
2. **KiWIS time series API** (`timeseries.sepa.org.uk`). SEPA's newer, strategic service. It holds the full archive and live data for rain, river, groundwater and tide, with ready-made 15-min, hourly, daily, monthly and yearly rainfall totals. **`getTimeseriesValueLayer` returns the latest value for a whole group of stations in one call.** That covers our "15m latest" and the 6h/24h snapshots without paging, so it is simpler than the EA bulk endpoint.

How it fits the app:
- **Daily totals come ready-made**, so there is no 10 MB CSV to parse. The cron requests SEPA daily totals and upserts them into `station_daily_totals`.
- **Backfill is easy.** KiWIS keeps years of history, so 3-month and 1-year presets would work for Scotland from day one.
- SEPA's docs showed a service notice (Jan 2026) about intermittent data at some stations, so treat gaps as normal.

Still to check (could not reach SEPA's pages from this environment):
- The exact KiWIS `ts_path` for rainfall totals (docs show the pattern `1/*/RE/15m.Total`), and whether KiWIS has rate limits or needs a key. The legacy API needs neither.
- Whether the legacy API is being retired in favour of KiWIS. **Build on KiWIS** to avoid that risk.

### 3.2 Wales: Natural Resources Wales (usable, with caveats)

- **The NRW API portal** (`api-portal.naturalresources.wales`) offers a **River Levels API** covering *river levels, rainfall and sea levels* at NRW stations. Readings are usually every 15 minutes. **You must sign up for a free API key.** The data is OGL.
- **The data is unvalidated** and the portal promises no service level. The EA feed is the same in practice.
- **⚠ Storage clause:** NRW's metadata says the data *"should not be stored for more than 1 calendar year"*. That conflicts with keeping a permanent history in `station_daily_totals` (and with a future 1-year preset). **Ask NRW in writing** whether derived daily totals are covered. If they are, add a retention job that deletes Welsh rows older than 365 days.
- **Long-term history:** NRW separately publishes **quality-controlled daily rain gauge data** (OGL) about **3 months after the fact**. That suits backfill and long-term presets better and may not have the 1-year clause.
- **No daily archive CSV** like the EA's. Welsh daily totals would have to be **built by the cron** from 15-minute readings, by summing each UTC day's readings and writing a row. That means more cron state and logic than for Scotland.
- **Station count is not published** ("100s of telemetry sites", covering all parameters). An estimate of 150–250 rain gauges is unconfirmed. Count them from the station list once you have a key.
- The API key must stay **server-side** (Railway env var or Vercel function). The browser must never call NRW directly.
- **Response format to check:** some metadata calls it "API (XML)", other NRW APIs use JSON through Azure API Management.

Note: some gauges near the Welsh border are run by the EA, so they may already show up. De-duplicate on location when merging.

### 3.3 Northern Ireland: the gap

- **DfI Rivers** runs about 130 **water-level** stations with a download viewer (OGL, best efforts). **No open rainfall gauge API was found.**
- **NI Water** runs rain gauges, but nothing published was found.
- **Met Office Land Observations** (DataHub; free tier is 360 calls/day) covers about 150 UK stations about 50 km apart, hourly. That is a handful of NI sites, too sparse for the 25 km interpolation cutoff. Not confirmed: whether rainfall is in the response.
- **Met Office land observations on AWS Open Data**: hourly CSVs, 250+ UK sites, 31 parameters, rolling 7-day window. It may include precipitation for a few NI sites. Licence and parameter list not yet confirmed.
- **Radar** (Met Office composite) covers the whole UK, but it is a different product (precipitation rate, not gauge totals). Licensing is restrictive (CEDA NIMROD is research-only) or paid at the volume we would need. This would be a separate epic, not a quick extension.

**Options for NI, in order of preference:**
1. **Show NI greyed out with a "No open rainfall data available" note**, and **email DfI Rivers / NI Water** asking for an OGL feed. No cost.
2. Add the few Met Office NI stations **as dots only** (no surface), with "(Met Office, hourly)" in the station panel.
3. A radar layer for the whole UK as a later feature. High effort and licensing cost; out of scope here.

### 3.4 UK-wide bonus: historic averages (Epic 8)

The **Met Office HadUK-Grid** (OGL v3, on CEDA) has 1 km rainfall grids for the **whole UK**, including **1991–2020 averages**, and area averages for each UK nation and river basin. So once Scotland and Wales are added, Epic 8 ("period vs average") works the same way in every nation, NI included, even without NI gauges. Check that the newest release (v1.3.x) still includes the 1991–2020 grids.

## 4. Recommended architecture

**Rule: the browser reads from one place (Supabase). The cron collects from many places.**

The current design already points this way (6h/24h and 7d/28d come from Supabase). The only parts still calling the EA from the browser are **15m live, custom ranges and the station panel**. Extending that browser-side pattern to SEPA/NRW would mean:
- CORS on SEPA and NRW is unknown and likely to be a problem.
- The NRW API key would be exposed in the browser.
- The frontend would need three parsers and three failure modes.

Proposed shape (described only, not built):

1. **Provider adapters in `ingest/`**: `ea`, `sepa`, `nrw` (later `metoffice`), each exposing `listStations()`, `latest()`, `recentTotals(hours)` and `dailyTotals(date)`. Each provider fails on its own: if SEPA is down, England still updates.
2. **Namespaced station refs**: `station_ref` becomes `sepa:<id>` / `nrw:<id>`, and existing EA refs stay bare. Migrating the existing EA rows is unnecessary because they keep bare refs.
3. **New `stations` table** in Supabase: `station_ref, provider, nation, region, label, lat, long, active`. The cron refreshes it daily. The frontend reads it once (about 1,500 rows, so use one RPC or `range()` paging to stay under the 1,000-row limit).
4. **15m latest in Supabase too**: add a `recent_totals` row (for example `hours = 0`, meaning "latest 15-min") holding the newest 15-min value per station from all providers. The cron already runs every 15 min, so freshness drops to about 0–15 min, which is fine for this product.
5. **`station_daily_totals` unchanged** apart from the new refs. Add a `provider` column, or derive it from the ref prefix.
6. **Station panel time series** for non-EA stations goes through a small Vercel function proxy (`/api/station-readings?ref=sepa:123`) that holds the NRW key and normalises the response.
7. **Custom ranges** stay EA-only at first, or move to `station_daily_totals` (daily resolution), which would also fix the existing ~130-station under-sampling.

## 5. Frontend changes

- **Boundary / clip polygon:** replace `ea-areas.geojson` for clipping with a **UK coastline**, for example the ONS "Countries (UK)" generalised boundaries (OGL). Use the BUC "ultra generalised" version to keep the file small, since it loads on first paint. Keep the EA areas for England's regional breakdown.
- **Regions:** generalise `eaAreaName` to `region` + `nation`. Scotland could use SEPA's regions or council areas, Wales could use NRW operational areas or the whole nation. The regional summary should group by nation first.
- **Map view:** change the default centre and zoom so Shetland to Cornwall fits on desktop (about 54.5 N, zoom 5.0), and keep a tighter view on mobile. `minZoom 4.5` is probably fine.
- **Surface grid size:** the interpolated area roughly doubles (England is about 130k km²; the UK is about 243k km² plus sea in the bounding box). Grid cost grows with it, so **profile on a mid-range phone** and lower resolution at low zoom if needed.
- **Sparse gauges:** SEPA has about 1 gauge per 280 km², against the EA's 1 per 130 km², and the Highlands are much sparser. With a 25 km cutoff, much of the north-west Highlands will **fade to "no coverage"**. That is honest, but it should be explained in the legend or an info tooltip. Do not raise the cutoff to hide it.
- **Buddy check (`removeOutliers`):** tuned for EA density. With fewer neighbours in Scotland it may drop real local downpours, or keep a broken gauge. Test with real SEPA data.
- **Colour scales:** the western Highlands and Snowdonia often exceed the current top bands (28d > 300 mm, 24h > 64 mm). Expect the top colours to saturate more often. Option: one extra top band for 7d/28d. That is a design decision; the scale table in `CLAUDE.md` would change.
- **Snow:** unheated tipping-bucket gauges under-read in snow, mainly in the Scottish uplands in winter. Mention this in the station panel or about text.
- **Attribution:** the OGL requires crediting SEPA ("Contains SEPA data © SEPA") and NRW. The map footer or about panel needs updating.
- **Copy and branding:** "UK" in the app already implies full coverage. NI must be visibly marked as "no data" rather than looking dry.

## 6. Cost and resources

### 6.1 Infrastructure (monthly)

| Item | Today | After Scotland + Wales | Notes |
|---|---|---|---|
| Stations | about 1,000 (EA) | about 1,450–1,550 | SEPA about 275 + NRW estimated 150–250 |
| `station_daily_totals` growth | about 365k rows/yr | about 550k rows/yr | About 100 bytes/row with PK and index, so **about 35 MB/yr → about 55 MB/yr** |
| Supabase | Free tier (500 MB DB) | Still free for **several years** | Pro is $25/mo if limits are hit, or if the free-tier "pause after 7 days inactive" becomes a problem. The cron's activity should prevent the pause |
| Railway cron | runs every 15 min | Same schedule, a few more HTTP calls per run (SEPA layer call is about 1–3 requests, NRW is about 1–2) | A few extra seconds per run, **negligible** cost change |
| Vercel | Function for 6h/24h fallback | Plus the station-readings proxy (cheap, cacheable) | Stays within current plan limits |
| API fees | £0 | **£0** | SEPA, NRW and HadUK-Grid are all OGL and free. Met Office DataHub free tier only if used for NI |
| **Total change** | | **about £0–5/month** | |

*Prices are from third-party summaries and should be checked against current Supabase, Railway and Vercel pricing pages.*

### 6.2 Developer effort (one developer, rough)

| Phase | Work | Estimate |
|---|---|---|
| 0. Spikes and admin | Confirm SEPA KiWIS paths and limits. Register NRW key and check its rainfall endpoint and format. Email NRW about the storage clause. Email DfI / NI Water. Pick a boundary file. | 2–3 days (plus waiting on replies) |
| 1. Ingest refactor | Provider-adapter structure, `stations` table, namespaced refs, 15m-latest row in `recent_totals`. Move EA code behind the adapter with no behaviour change. | 4–6 days |
| 2. Scotland | SEPA adapter (stations, latest, recent, daily), backfill script, unit and smoke tests | 4–6 days |
| 3. Wales | NRW adapter, building daily totals from 15-min readings, retention job if required, tests | 4–7 days |
| 4. Frontend UK-wide | Read stations and 15m from Supabase, UK clip polygon, view, region/nation grouping, station-panel proxy, attribution, "no data" state for NI, legend copy | 6–9 days |
| 5. Tuning and QA | Surface performance on mobile, buddy-check tuning, colour band review, BDD scenarios for Scotland/Wales stations | 3–5 days |
| **Total** | | **about 23–36 days (about 4–7 weeks)** |
| NI (if a feed becomes available) | One more adapter + boundary | +3–5 days |

### 6.3 Ongoing upkeep

- **Three upstream APIs instead of one.** Each can change format, rate-limit or go down. Add one smoke test per provider (extending `npm run test:smoke`) and a per-provider "last successful update" timestamp in `recent_totals`, so the UI can show "Scotland data delayed".
- **NRW API key rotation**, and possibly the retention job.
- **Licence attributions** to keep correct.

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| NRW 1-year storage clause blocks long-term Welsh history | Medium | Medium | Get written clarification. Use QC'd daily dataset for history. Add a retention job |
| SEPA legacy API retired | Medium | Low (if built on KiWIS) | Build on KiWIS |
| NI never gets open gauge data | High | Medium (UX: "UK" app with a hole) | Clear "no open data" state. HadUK-Grid averages still cover NI for Epic 8. Radar as a separate later epic |
| Sparse Highland coverage looks broken | High | Low–medium | Explain coverage fade in legend. Station dots still show |
| Surface rendering slower on mobile | Medium | Medium | Profile; adapt grid resolution to zoom |
| Mixed data quality across providers (unvalidated feeds) | High | Low | Same as EA today. Buddy check plus "provisional data" note |

## 8. Recommended next steps

1. **Phase 0 admin now** (no code). Register for an NRW API key. Email NRW about storage terms, and DfI Rivers / NI Water about rainfall data. These have the longest lead time.
2. **Spike SEPA KiWIS** (half a day). Pull the station list and one day of daily totals, and check the station count, coordinates and value formats.
3. Decide on the **NI presentation** (greyed "no data" is recommended) and on whether **colour bands** change for wetter western uplands.
4. Then plan the work as **Epic 9: UK nations**, in order: ingest refactor → Scotland → frontend UK-wide → Wales → (NI when possible).

## 9. Sources

- SEPA rainfall data download and legacy API: https://www2.sepa.org.uk/rainfall/DataDownload
- SEPA time series (KiWIS) API docs: https://timeseriesdoc.sepa.org.uk/api-documentation/api-endpoint-examples/time-series-data-queries/
- SEPA customer guidance on hydrometric data: https://sepa.gov.uk/media/594158/customerguidance_accessinghydrometricinformation_v10.docx
- NRW API portal: https://api-portal.naturalresources.wales/
- NRW River Levels API metadata (storage clause, unvalidated): https://metadata.naturalresources.wales/geonetwork/srv/api/records/NRW_DS116446
- NRW quality-controlled daily rain gauge data: https://metadata.naturalresources.wales/geonetwork/srv/api/records/NRW_DS116322
- NRW rivers and seas service: https://rivers-and-seas.naturalresources.wales/
- DfI Rivers water level network: https://www.infrastructure-ni.gov.uk/articles/dfi-rivers-water-level-network
- Met Office DataHub observations pricing: https://datahub.metoffice.gov.uk/pricing/observations
- Met Office UK land observations on AWS Open Data: https://registry.opendata.aws/met-office-uk-land-observations/
- MIDAS Open hourly rainfall (CEDA): https://data-search.nerc.ac.uk/geonetwork/srv/api/records/f7ae919f96b44a1c9695f40a9cf988dd
- HadUK-Grid overview: https://www.metoffice.gov.uk/research/climate/maps-and-data/data/haduk-grid/overview
- Supabase pricing summary (third-party): https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/

*Note: this environment's network policy blocked direct fetches of the SEPA, NRW, DfI and Met Office pages, so the details above come from search-result summaries of those pages. Items marked "to check" or "unconfirmed" need checking in Phase 0.*

## 10. Verified 15 October 2026 (live checks)

### Scotland (SEPA KiWIS)
- Legacy `www2.sepa.org.uk/rainfall/api` is **retired** (redirects to rainfall.sepa.org.uk). Use KiWIS only.
- KiWIS: no key, OGL, CORS `*`. `getTimeseriesList&ts_path=1/*/RE/15m.Total` → **304 rain gauges** (283 reported in the last 24 h).
- `getTimeseriesValueLayer` → latest 15-min value for all gauges in one call (~3 s). `getTimeseriesValues&ts_path=1/*/RE/Hour.Total&from&to` → hourly totals for all gauges in one call (24 h ≈ 1.6 s). Daily history back to at least Jan 2025 in one call (~6.7 s).
- `HDay.Total` is a **09:00–09:00 hydrological day**; build calendar days from `Hour.Total` to match England.
- `LTV.HMonth.Mean` (long-term monthly means per gauge) exists — relevant to Epic 8.

### Wales (NRW `rivers-and-seas/v1`, with key)
- Product "Open Data – River Levels, Rainfall and Sea Data API": no approval, key issued instantly. Header `Ocp-Apim-Subscription-Key`.
- `GET /api/StationData` (one call, ~1.2 s): 409 stations — **150 rain gauges** (149 online, 144 reported in the last hour), 248 river level, 10 tide.
- **`latestValue` for rainfall is a rolling 1-hour total**, not the 15-min value (confirmed against history on several gauges; e.g. 2.8 mm latest = 2.8 mm summed over the last hour, last 15-min reading 0.4 mm). `parameterStatusEN` gives a text band ("Dry", "Light Rain", …).
- Each gauge has its **own parameter id** (150 distinct); `historical?location=&parameter=` needs the matching pair.
- `historical` returns **~1 year of 15-min readings** (from 2025-10-01), ~36k points / **~1.5 MB per call**. Date-range parameters (`from/to`, `startDate/endDate`, `since`) are **ignored**. Some gauges return **no history** (e.g. locations 1064, 1112).
- **Rate limiting:** HTTP 429 with `retry-after: 13` after ~a dozen calls in quick succession. Polling 150 gauges' history every 15 min is not viable.
- **Workable without extra access:** snapshot `StationData` every 15 min (1 call) and store each gauge's 1-hour total; 6h/24h and calendar-day totals are sums of back-to-back hourly windows. Use `historical` only for backfill (rate-limited, ~150 × 1.5 MB, once).
- Telemetry API v1 (bulk readings) still not in any public product — asked NRW (issue #92).
