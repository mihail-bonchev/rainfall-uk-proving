from flask import Blueprint, render_template, jsonify
from app.services import station_service
from app.services import agg_service
from app.services import latest_service

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    """Render main map page"""
    return render_template('index.html')

@bp.route('/api/stations')
def get_stations():
    """API endpoint to fetch all rainfall stations"""
    try:
        stations = station_service.fetch_all_stations()
        return jsonify({
            'success': True,
            'count': len(stations),
            'stations': stations
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@bp.route('/api/station-total/<station_id>')
def get_station_total(station_id: str):
    """Return aggregated total for a station for the processed day."""
    try:
        result = agg_service.get_total_for_station(station_id)
        if not result:
            return jsonify({'success': False, 'error': 'No data for station'}), 404
        return jsonify({'success': True, 'station': station_id, 'date': result['date'], 'total': result['total'], 'count': result['count']})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@bp.route('/api/station-latest/<station_id>')
def get_station_latest(station_id: str):
    """Return the cached latest reading (near-live) for a station, if available."""
    try:
        result = latest_service.get_latest_for_station(station_id)
        if not result:
            return jsonify({'success': False, 'error': 'No latest data for station'}), 404
        return jsonify({'success': True, 'station': station_id, 'latest': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
