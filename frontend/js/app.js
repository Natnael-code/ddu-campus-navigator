let tg = window.Telegram.WebApp;
tg.expand();

const dduCenter = [9.6200, 41.8405];
const map = L.map('map').setView(dduCenter, 17);

// High-resolution satellite layer
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
}).addTo(map);

let markers = [];
let allLocations = [];
let userMarker = null;
let userCircle = null;

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
                focusLocation(found);
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
        marker.on('click', () => focusLocation(loc));
        markers.push({ name: loc.name, marker: marker });
    });
}

function focusLocation(loc) {
    map.setView([loc.lat, loc.lng], 19);
    markers.forEach(m => {
        if (m.name === loc.name) {
            m.marker.openPopup();
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
        item.onclick = () => focusLocation(loc);
        listContainer.appendChild(item);
    });
}

function filterLocations() {
    let query = document.getElementById('search-box').value.toLowerCase();
    let filtered = allLocations.filter(loc => loc.name.toLowerCase().includes(query) || loc.category.toLowerCase().includes(query));
    renderList(filtered);
    renderMarkers(filtered);
}

// Live GPS Tracking
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
                        html: '<div style="background-color: #2196F3; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 8px rgba(0,0,0,0.6);"></div>',
                        iconSize: [16, 16]
                    })
                }).addTo(map).bindPopup("You are here");

                userCircle = L.circle([lat, lng], { radius: accuracy, color: '#2196F3', fillOpacity: 0.15 }).addTo(map);
            } else {
                userMarker.setLatLng([lat, lng]);
                userCircle.setLatLng([lat, lng]);
                userCircle.setRadius(accuracy);
            }
        },
        (error) => {
            console.warn("GPS error:", error.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
    );
}

loadLocations();