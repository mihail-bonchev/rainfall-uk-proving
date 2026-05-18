#!/usr/bin/env python3
"""Process a downloaded readings CSV for a single day and aggregate rainfall per station.

Outputs a SQLite DB at data/agg_YYYY_MM_DD.sqlite with table `station_totals(date, station_reference, total, count)`
"""
import csv
import sqlite3
import requests
import os
import logging
from urllib.parse import urljoin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'data')
DATA_DIR = os.path.abspath(DATA_DIR)

CSV_FILENAME = os.path.join(DATA_DIR, 'readings-2025-11-21.csv')
OUT_DB = os.path.join(DATA_DIR, 'agg_2025_11_21.sqlite')
MEASURES_URL = 'https://environment.data.gov.uk/flood-monitoring/id/measures?parameter=rainfall&_limit=10000'


def fetch_measure_map():
    """Fetch measures and return dict mapping measure_url -> stationReference"""
    logger.info('Fetching measures metadata...')
    resp = requests.get(MEASURES_URL, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    mapping = {}
    items = data.get('items', [])
    for it in items:
        key = it.get('@id')
        station_ref = it.get('stationReference') or it.get('station')
        # if station field is a URL, convert to stationReference if present
        if isinstance(station_ref, str) and station_ref.startswith('http'):
            # try to extract last path segment
            station_ref = station_ref.rstrip('/').split('/')[-1]
        if key and station_ref:
            mapping[key] = station_ref
    logger.info(f'Fetched {len(mapping)} measure->station mappings')
    return mapping


def process_csv(csv_path, measure_map):
    """Read CSV and aggregate values per station.
    CSV expected columns: dateTime,measure,value
    Only process measures that are in measure_map (rainfall measures)
    """
    totals = {}  # station_ref -> (sum, count)
    if not os.path.exists(csv_path):
        raise FileNotFoundError(csv_path)

    with open(csv_path, 'r', newline='') as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header:
            raise Exception('CSV has no header')
        # Expect header columns; find indices
        try:
            idx_date = header.index('dateTime')
            idx_measure = header.index('measure')
            idx_value = header.index('value')
        except ValueError:
            # CSV may use different header; be permissive
            idx_date, idx_measure, idx_value = 0, 1, 2

        for row in reader:
            if len(row) <= idx_value:
                continue
            date_time = row[idx_date]
            measure = row[idx_measure]
            value_str = row[idx_value]
            if not measure:
                continue
            # Only process rainfall measures that exist in mapping
            station_ref = measure_map.get(measure)
            if not station_ref:
                # If mapping not present, skip
                continue
            try:
                val = float(value_str)
            except Exception:
                continue
            ssum, scount = totals.get(station_ref, (0.0, 0))
            totals[station_ref] = (ssum + val, scount + 1)
    logger.info(f'Aggregated totals for {len(totals)} stations')
    return totals


def write_db(db_path, date_str, totals):
    logger.info(f'Writing results to {db_path}')
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('''
    CREATE TABLE IF NOT EXISTS station_totals (
        date TEXT,
        station_reference TEXT PRIMARY KEY,
        total REAL,
        count INTEGER
    )
    ''')
    cur.execute('DELETE FROM station_totals')
    rows = []
    for station_ref, (total, count) in totals.items():
        rows.append((date_str, station_ref, total, count))
    cur.executemany('INSERT INTO station_totals(date, station_reference, total, count) VALUES(?,?,?,?)', rows)
    conn.commit()
    conn.close()
    logger.info('DB write complete')


if __name__ == '__main__':
    # Ensure data dir exists
    os.makedirs(DATA_DIR, exist_ok=True)
    measure_map = fetch_measure_map()
    totals = process_csv(CSV_FILENAME, measure_map)
    # derive date from filename (2025-11-21)
    date_str = '2025-11-21'
    write_db(OUT_DB, date_str, totals)
    logger.info('Processing finished.')
