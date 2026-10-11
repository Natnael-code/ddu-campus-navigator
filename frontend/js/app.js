// Initialize Telegram WebApp API
let tg = window.Telegram.WebApp;
tg.expand();

// Center map on Dire Dawa University
const dduCenter = [9.6200, 41.8405];
const map = L.map('map').setView(dduCenter, 17);

// Add crisp satellite layer (Esri World Imagery)
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
    maxZoom: 19
}).addTo(map);

let markers = [];
let allLocations = [];
let userMarker = null;
let userCircle = null;

// Check URL parameters if a target was passed from the Telegram Bot button
const urlParams = new URLSearchParams(window.location.search);
const targetBuilding = urlParams.get('target');

// Fetch locations from FastAPI backend
async function loadLocations() {
    try {
        let response = await fetch('http://127.0.0.1:8000/api/locations');
        allLocations = await response.json();
        renderList(allLocations);
        renderMarkers(allLocations);

        // If user came from a specific bot button, focus that building
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

        marker.on('click', () => {
            focusLocation(loc);
        });

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

// Live GPS Navigation Tracking
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
        },
        (error) => {
            console.warn("GPS location access denied or unavailable:", error.message);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
}

loadLocations();