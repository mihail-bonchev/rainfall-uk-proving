"""Aggregation service reading from SQLite DB produced by processing script."""
import sqlite3
import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB_PATH = os.path.join(BASE_DIR, '..', 'data', 'agg_2025_11_21.sqlite')


def get_total_for_station(station_reference):
    """Return (total, count, date) for station_reference or (None,0,None) if not found."""
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('SELECT date, total, count FROM station_totals WHERE station_reference = ?', (station_reference,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {'date': row[0], 'total': float(row[1]), 'count': int(row[2])}
