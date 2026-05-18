"""Service for fetching and managing rainfall station data"""
import requests
import logging

logger = logging.getLogger(__name__)

API_BASE = 'https://environment.data.gov.uk/flood-monitoring'

def fetch_all_stations():
    """Fetch all rainfall measuring stations from the API"""
    try:
        url = f'{API_BASE}/id/stations?parameter=rainfall&_limit=500'
        logger.info(f'Fetching stations from {url}')
        
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        stations = []
        
        if 'items' in data and isinstance(data['items'], list):
            for item in data['items']:
                station = {
                    'id': item.get('stationReference', ''),
                    'label': item.get('label', ''),
                    'lat': item.get('lat'),
                    'long': item.get('long'),
                    'region': item.get('eaRegionName', 'Unknown'),
                    'gridReference': item.get('gridReference', ''),
                }
                
                # Only include stations with valid coordinates
                if station['lat'] is not None and station['long'] is not None:
                    stations.append(station)
        
        logger.info(f'Successfully fetched {len(stations)} stations')
        return stations
        
    except requests.RequestException as e:
        logger.error(f'API request failed: {e}')
        raise Exception(f'Failed to fetch stations: {e}')
    except Exception as e:
        logger.error(f'Unexpected error: {e}')
        raise Exception(f'Error processing stations: {e}')
