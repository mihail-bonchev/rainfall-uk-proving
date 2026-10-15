-- Run once in the Supabase SQL editor (issue #77).
-- One row per rain gauge from every provider, refreshed daily by ingest/cron.js.
-- EA refs stay bare (match station_daily_totals); other providers are prefixed, e.g. 'sepa:14897'.
CREATE TABLE IF NOT EXISTS stations (
  station_ref TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,              -- 'ea' | 'sepa' | 'nrw'
  nation      TEXT NOT NULL,              -- 'England' | 'Scotland' | 'Wales'
  region      TEXT,                       -- EA area name for EA; NULL until defined for others
  label       TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  long        DOUBLE PRECISION NOT NULL,
  grid_ref    TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon can read stations" ON stations;
CREATE POLICY "anon can read stations" ON stations FOR SELECT TO anon USING (true);
GRANT SELECT ON stations TO anon;

-- The frontend reads every station through this RPC: it returns ONE json array,
-- so 1,000+ stations never hit PostgREST's 1,000-row response cap.
CREATE OR REPLACE FUNCTION get_stations()
RETURNS json
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    json_agg(
      json_build_object(
        'station_ref', station_ref,
        'provider', provider,
        'nation', nation,
        'region', region,
        'label', label,
        'lat', lat,
        'long', long,
        'grid_ref', grid_ref
      )
      ORDER BY station_ref
    ),
    '[]'::json
  )
  FROM stations;
$$;

GRANT EXECUTE ON FUNCTION get_stations() TO anon;
