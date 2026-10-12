let tg = window.Telegram.WebApp;
tg.expand();

const statusBanner = document.getElementById('status-banner');

function getURLParam(key) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
}

const requestedDest = getURLParam('dest') || 'Computing';

const dduCenter = [9.6200, 41.8405];
const map = L.map('map', { zoomControl: true }).setView(dduCenter, 17);

// Google Hybrid Satellite Layer
const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Google Satellite'
}).addTo(map);

let markers = [];
let allLocations = [];
let userMarker = null;
let routingControl = null;
let currentDestination = null;

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/locations'
    : '/api/locations';

async function loadLocations() {
    try {
        let response = await fetch(API_URL);
        allLocations = await response.json();
        renderList(allLocations);
        renderMarkers(allLocations);

        // Smart matching for short query parameters from the bot
        let target = allLocations.find(loc => loc.name.toLowerCase().includes(requestedDest.toLowerCase())) || allLocations[0];
        if (target) {
            setDestination(target);
        }
    } catch (error) {
        console.error("Error loading locations:", error);
        statusBanner.innerText = "⚠️ Failed to load campus locations.";
    }
}

function renderMarkers(locations) {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];

    locations.forEach(loc => {
        let marker = L.marker([loc.lat, loc.lng]).addTo(map);
        marker.bindTooltip(`📍 ${loc.name}`, {
            permanent: true,
            direction: 'top',
            className: 'landmark-label'
        });
        marker.on('click', () => setDestination(loc));
        markers.push({ name: loc.name, marker: marker, loc: loc });
    });
}

function renderList(locations) {
    const listContainer = document.getElementById('building-list');
    listContainer.innerHTML = '';

    locations.forEach(loc => {
        let item = document.createElement('div');
        item.className = 'building-item';
        item.innerHTML = `
            <h4>${loc.name}</h4>
            <span>${loc.category}</span>
        `;
        item.onclick = () => setDestination(loc);
        listContainer.appendChild(item);
    });
}

function filterLocations() {
    let query = document.getElementById('search-box').value.toLowerCase();
    let filtered = allLocations.filter(loc => loc.name.toLowerCase().includes(query) || loc.category.toLowerCase().includes(query));
    renderList(filtered);
}

function setDestination(loc) {
    currentDestination = loc;
    statusBanner.innerText = `🎯 Navigating to ${loc.name}`;

    if (userMarker) {
        updateRoute(userMarker.getLatLng(), [loc.lat, loc.lng]);
    } else {
        map.setView([loc.lat, loc.lng], 18);
    }
}

const userLiveIcon = L.divIcon({
    className: 'user-position-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

function updateRoute(startLatLng, destCoords) {
    if (!currentDestination) return;

    if (!routingControl) {
        routingControl = L.Routing.control({
            waypoints: [
                L.latLng(startLatLng.lat, startLatLng.lng),
                L.latLng(destCoords[0], destCoords[1])
            ],
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'foot'
            }),
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            showAlternatives: false,
            collapsible: true,
            lineOptions: {
                styles: [{ color: '#38bdf8', opacity: 0.9, weight: 6 }]
            }
        }).addTo(map);
    } else {
        routingControl.setWaypoints([
            L.latLng(startLatLng.lat, startLatLng.lng),
            L.latLng(destCoords[0], destCoords[1])
        ]);
    }
}

// Live GPS Tracking
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            let lat = position.coords.latitude;
            let lng = position.coords.longitude;
            let latLng = L.latLng(lat, lng);

            if (!userMarker) {
                userMarker = L.marker(latLng, { icon: userLiveIcon })
                    .addTo(map)
                    .bindPopup("<b>📱 You are here</b>");
            } else {
                userMarker.setLatLng(latLng);
            }

            if (currentDestination) {
                updateRoute(latLng, [currentDestination.lat, currentDestination.lng]);
            }
        },
        (error) => {
            console.warn("GPS error:", error.message);
            statusBanner.innerText = "⚠️ GPS signal unavailable. Tap any building to view.";
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
    );
}

loadLocations();