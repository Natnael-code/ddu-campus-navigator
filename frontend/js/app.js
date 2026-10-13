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

const googleHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Google Satellite'
}).addTo(map);

let markersMap = new Map();
let allLocations = [];
let userMarker = null;
let routingControl = null;
let currentDestination = null;
let showAllEnabled = true;

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/locations'
    : '/api/locations';

async function loadLocations() {
    try {
        let response = await fetch(API_URL);
        allLocations = await response.json();
        renderList(allLocations);
        renderMarkers(allLocations);

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
    // Clear old markers
    markersMap.forEach((marker) => map.removeLayer(marker));
    markersMap.clear();

    locations.forEach(loc => {
        let marker = L.marker([loc.lat, loc.lng]);

        // Popup with name on click (Permanent text badge labels removed from map view)
        marker.bindPopup(`<b>📍 ${loc.name}</b><br><span>${loc.category}</span>`);
        marker.on('click', () => setDestination(loc));

        if (showAllEnabled || (currentDestination && currentDestination.name === loc.name)) {
            marker.addTo(map);
        }

        markersMap.set(loc.name, marker);
    });
}

function toggleShowAll() {
    showAllEnabled = document.getElementById('show-all-toggle').checked;
    markersMap.forEach((marker, name) => {
        if (showAllEnabled || (currentDestination && currentDestination.name === name)) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
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

// Single-word partial matching search logic
function filterLocations() {
    let query = document.getElementById('search-box').value.toLowerCase().trim();
    if (!query) {
        renderList(allLocations);
        return;
    }

    let searchTerms = query.split(/\s+/);
    let filtered = allLocations.filter(loc => {
        let text = `${loc.name} ${loc.category}`.toLowerCase();
        return searchTerms.every(term => text.includes(term));
    });

    renderList(filtered);
}

function setDestination(loc) {
    currentDestination = loc;
    statusBanner.innerText = `🎯 Navigating to ${loc.name}`;

    // Update marker visibility based on toggle state
    markersMap.forEach((marker, name) => {
        if (showAllEnabled || name === loc.name) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
    });

    let targetMarker = markersMap.get(loc.name);
    if (targetMarker) {
        targetMarker.openPopup();
    }

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