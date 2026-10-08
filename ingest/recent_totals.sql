-- Run once in the Supabase SQL editor.
-- Two rows (hours = 6 and 24), refreshed every 15 min by ingest/cron.js.
-- totals is a JSON object { "<station_ref>": mm, ... } so the frontend reads one row,
-- avoiding PostgREST's 1,000-row limit.
CREATE TABLE IF NOT EXISTS recent_totals (
  hours         SMALLINT PRIMARY KEY,
  computed_at   TIMESTAMPTZ NOT NULL,
  station_count INTEGER NOT NULL,
  totals        JSONB NOT NULL
);

ALTER TABLE recent_totals ENABLE ROW LEVEL SECURITY;

-- Public read for the frontend (anon key). Writes use the service key, which bypasses RLS.
DROP POLICY IF EXISTS "anon can read recent totals" ON recent_totals;
CREATE POLICY "anon can read recent totals" ON recent_totals FOR SELECT TO anon USING (true);

-- Belt and braces: the table is new, so grant explicitly (default grants vary by project).
GRANT SELECT ON recent_totals TO anon;
