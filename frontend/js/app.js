let tg = window.Telegram.WebApp;
tg.expand();

const dduCenter = [9.6200, 41.8405];
const map = L.map('map').setView(dduCenter, 17);

// High-resolution crisp satellite imagery
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid',
    maxZoom: 19
}).addTo(map);

let markers = [];
let allLocations = [];
let userMarker = null;
let userCircle = null;
let routeLine = null;
let activeTarget = null;

const urlParams = new URLSearchParams(window.location.search);
const targetBuilding = urlParams.get('target');

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/locations'
    : '/api/locations';

async function loadLocations() {
    try {
        let response = await fetch(API_URL);
        allLocations = await response.json();
        renderList(allLocations);
        renderMarkers(allLocations);

        if (targetBuilding) {
            let found = allLocations.find(loc => loc.name.toLowerCase().includes(targetBuilding.toLowerCase()));
            if (found) {
                setDestination(found);
            }
        }
    } catch (error) {
        console.error("Error loading locations:", error);
    }
}

function renderMarkers(locations) {
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    locations.forEach(loc => {
        let marker = L.marker([loc.lat, loc.lng]).addTo(map);
        marker.bindPopup(`<b>${loc.name}</b><br>Category: ${loc.category}`);
        marker.on('click', () => setDestination(loc));
        markers.push({ name: loc.name, lat: loc.lat, lng: loc.lng, marker: marker });
    });
}

function setDestination(loc) {
    activeTarget = loc;
    map.setView([loc.lat, loc.lng], 19);

    markers.forEach(m => {
        if (m.name === loc.name) {
            m.marker.openPopup();
        }
    });

    showNavigationBanner(loc.name);
    updateRoute();
}

function showNavigationBanner(name) {
    let banner = document.getElementById('nav-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'nav-banner';
        banner.style.cssText = "position:absolute; top:10px; right:10px; background:#004d40; color:white; padding:10px 15px; border-radius:8px; z-index:2000; font-size:0.9rem; box-shadow:0 4px 6px rgba(0,0,0,0.3);";
        document.body.appendChild(banner);
    }
    banner.innerHTML = `🧭 Navigating to: <b>${name}</b><br><span id='distance-text' style='font-size:0.8rem; color:#b2dfdb;'>Calculating steps...</span>`;
}

function updateRoute() {
    if (!userMarker || !activeTarget) return;
    let userLatLng = userMarker.getLatLng();
    let targetLatLng = [activeTarget.lat, activeTarget.lng];

    // Calculate distance in meters
    let distance = map.distance(userLatLng, targetLatLng);
    let distText = distance > 1000 ? (distance / 1000).toFixed(2) + " km" : Math.round(distance) + " meters";

    let distEl = document.getElementById('distance-text');
    if (distEl) {
        distEl.innerText = `Distance away: ${distText} — Follow path`;
    }

    // Draw guidance line
    if (routeLine) {
        map.removeLayer(routeLine);
    }
    routeLine = L.polyline([userLatLng, targetLatLng], { color: '#2196F3', weight: 4, dashArray: '6, 6' }).addTo(map);
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
    renderMarkers(filtered);
}

// Live GPS Tracking & Guidance update
if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            let lat = position.coords.latitude;
            let lng = position.coords.longitude;
            let accuracy = position.coords.accuracy;

            if (!userMarker) {
                userMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: 'user-gps-dot',
                        html: '<div style="background-color: #2196F3; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>',
                        iconSize: [14, 14]
                    })
                }).addTo(map).bindPopup("You are here");

                userCircle = L.circle([lat, lng], { radius: accuracy, color: '#2196F3', fillOpacity: 0.15 }).addTo(map);
            } else {
                userMarker.setLatLng([lat, lng]);
                userCircle.setLatLng([lat, lng]);
                userCircle.setRadius(accuracy);
            }

            if (activeTarget) {
                updateRoute();
            }
        },
        (error) => {
            console.warn("GPS tracking unavailable:", error.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
    );
}

loadLocations();