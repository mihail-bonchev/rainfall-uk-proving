/**
 * UK Rainfall Station Map
 * Features: Basic zoom/pan controls, station markers
 */

let map;
let stationsLayer = null;
const UK_CENTER = [54.5, -3.5]; // UK center coordinates
const INITIAL_ZOOM = 6;

// Initialize map when page loads
function initMap() {
    console.log('Initializing map...');
    
    // Create map
    map = L.map('map').setView(UK_CENTER, INITIAL_ZOOM);
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
        minZoom: 5
    }).addTo(map);
    
    // Setup control buttons
    setupControls();
    
    // Load and display stations
    loadStations();
}

function setupControls() {
    document.getElementById('zoomInBtn').addEventListener('click', () => {
        map.zoomIn();
    });
    
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        map.zoomOut();
    });
    
    document.getElementById('resetBtn').addEventListener('click', () => {
        map.setView(UK_CENTER, INITIAL_ZOOM);
    });
}

function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

async function loadStations() {
    try {
        updateStatus('Fetching stations...');
        
        const response = await fetch('/api/stations');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch stations');
        }
        
        console.log(`Loaded ${data.count} stations`);
        displayStations(data.stations);
        updateStatus(`${data.count} rainfall stations displayed`);
        
    } catch (error) {
        console.error('Error loading stations:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

function displayStations(stations) {
    // Remove existing layer if any
    if (stationsLayer) {
        map.removeLayer(stationsLayer);
    }
    
    // Create feature group for stations
    stationsLayer = L.featureGroup();
    
    // Add each station as a marker
    stations.forEach(station => {
        const marker = L.circleMarker(
            [station.lat, station.long],
            {
                radius: 6,
                fillColor: '#3388ff',
                color: '#fff',
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0.7
            }
        );
        
        // Prepare base popup content
        const baseInfo = `\n            <strong>${station.label}</strong><br>\n            ID: ${station.id}<br>\n            Region: ${station.region}<br>\n            Lat: ${station.lat.toFixed(4)}, Long: ${station.long.toFixed(4)}\n        `;
        marker.bindPopup(baseInfo);

        // On click, fetch aggregated total for the latest full day and update popup
        marker.on('click', async function() {
                try {
                    // Fetch both the day total and cached latest reading in parallel
                    const [dayRes, latestRes] = await Promise.all([
                        fetch(`/api/station-total/${encodeURIComponent(station.id)}`),
                        fetch(`/api/station-latest/${encodeURIComponent(station.id)}`)
                    ]);

                    const [dayJson, latestJson] = await Promise.all([dayRes.json(), latestRes.json().catch(() => ({}))]);

                    let extras = '';
                    if (dayJson && dayJson.success) {
                        extras += `<br><strong>Day total (2025-11-21):</strong> ${Number(dayJson.total).toFixed(2)} mm (${dayJson.count} readings)`;
                    } else {
                        extras += `<br><em>No aggregated day total</em>`;
                    }

                    if (latestJson && latestJson.success && latestJson.latest) {
                        const v = Number(latestJson.latest.value).toFixed(2);
                        const dt = latestJson.latest.dateTime || latestJson.latest.fetched_at || '';
                        extras += `<br><strong>Latest (near-live):</strong> ${v} mm <small>(${dt})</small>`;
                    } else {
                        extras += `<br><em>No recent reading cached</em>`;
                    }

                    this.setPopupContent(baseInfo + extras);
                    this.openPopup();
                } catch (err) {
                    console.error('Error fetching station info:', err);
                    const extra = `<br><em>Error loading data</em>`;
                    this.setPopupContent(baseInfo + extra);
                    this.openPopup();
                }
        });
        
        marker.on('mouseover', function() {
            this.setStyle({
                fillColor: '#ff7800',
                weight: 3
            });
        });
        
        marker.on('mouseout', function() {
            this.setStyle({
                fillColor: '#3388ff',
                weight: 2
            });
        });
        
        stationsLayer.addLayer(marker);
    });
    
    // Add layer to map
    stationsLayer.addTo(map);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initMap);
