"""Cached latest readings poller for rainfall measures.

This module keeps an in-memory cache of latest readings keyed by stationReference and
persists a small JSON cache to `data/latest_cache.json` so it survives restarts.

Use `start_background_poller(app, interval_seconds=60)` from app startup to begin polling.
"""
import threading
import time
import requests
import os
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DATA_DIR = os.path.join(BASE_DIR, 'data')
CACHE_FILE = os.path.join(DATA_DIR, 'latest_cache.json')

# Bulk endpoint for latest readings (one request)
LATEST_ENDPOINT = 'https://environment.data.gov.uk/flood-monitoring/data/readings?parameter=rainfall&latest&_limit=5000'

# In-memory cache: stationReference -> {value, dateTime, measure}
_cache = {}
_lock = threading.Lock()
_stopper = threading.Event()


def _load_from_disk():
    if not os.path.exists(CACHE_FILE):
        return
    try:
        with open(CACHE_FILE, 'r') as fh:
            data = json.load(fh)
        with _lock:
            _cache.clear()
            for k, v in data.items():
                _cache[k] = v
        logger.info(f'Loaded {len(_cache)} cached latest readings from disk')
    except Exception as e:
        logger.warning(f'Failed to load latest cache from disk: {e}')


def _save_to_disk():
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        with _lock:
            with open(CACHE_FILE, 'w') as fh:
                json.dump(_cache, fh)
    except Exception as e:
        logger.warning(f'Failed to write latest cache to disk: {e}')


def _poll_once():
    try:
        logger.debug('Polling latest readings endpoint')
        resp = requests.get(LATEST_ENDPOINT, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        items = data.get('items', [])
        updated = 0
        with _lock:
            for it in items:
                # items typically include 'stationReference' and 'value' and 'dateTime'
                station_ref = it.get('stationReference')
                if not station_ref:
                    # fallback: try to infer from 'measure' mapping
                    station_ref = None
                value = it.get('value')
                dateTime = it.get('dateTime')
                measure = it.get('measure')
                if station_ref and value is not None:
                    _cache[station_ref] = {
                        'value': value,
                        'dateTime': dateTime,
                        'measure': measure,
                        'fetched_at': datetime.utcnow().isoformat() + 'Z'
                    }
                    updated += 1
        if updated:
            logger.info(f'Latest cache updated: {updated} items')
            _save_to_disk()
        else:
            logger.debug('Latest poll found no updatable items')
    except Exception as e:
        logger.warning(f'Error polling latest endpoint: {e}')


def _poll_loop(interval_seconds):
    logger.info(f'Starting latest readings poller (interval={interval_seconds}s)')
    _load_from_disk()
    while not _stopper.is_set():
        _poll_once()
        # Wait but allow early exit
        for _ in range(int(interval_seconds)):
            if _stopper.is_set():
                break
            time.sleep(1)
    logger.info('Latest readings poller stopped')


def start_background_poller(app=None, interval_seconds=60):
    """Start poller in a daemon thread. If `app` is provided, logs with app logger in addition.

    Call this from app startup (development-only) so it doesn't run in production WSGI workers.
    """
    if app:
        logger.info('Starting background poller from Flask app startup')
    t = threading.Thread(target=_poll_loop, args=(interval_seconds,), daemon=True)
    t.start()
    return t


def stop_poller():
    _stopper.set()


def get_latest_for_station(station_reference):
    """Return latest cached reading dict or None"""
    with _lock:
        return _cache.get(station_reference)


def get_batch(station_ids):
    """Return dict of station_id -> latest dict where present"""
    out = {}
    with _lock:
        for sid in station_ids:
            if sid in _cache:
                out[sid] = _cache[sid]
    return out
