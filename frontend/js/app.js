const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
    tg.expand();
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); // stops map drags from closing the Mini App
}

const statusBanner = document.getElementById('status-banner');
const searchBox = document.getElementById('search-box');
const followBtn = document.getElementById('follow-toggle');

function getURLParam(key) {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
}

const hasDestParam = getURLParam('dest') !== null;
const requestedDest = getURLParam('dest') || 'Computing';

/* If the map turns the wrong way on your phone, change this to -1 */
const ROTATION_SIGN = 1;

const dduCenter = [9.6200, 41.8405];
const map = L.map('map', {
    zoomControl: true,
    maxZoom: 20,
    // leaflet-rotate options (ignored if the plugin fails to load)
    rotate: true,
    bearing: 0,
    touchRotate: false,
    shiftKeyRotate: false,
    rotateControl: false
}).setView(dduCenter, 17);

/* lyrs=s = satellite imagery ONLY (no Google place names / POIs / labels),
   so wrongly named Google locations are hidden. Our own labels remain. */
L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Google Satellite'
}).addTo(map);

let markersMap = new Map();
let allLocations = [];
let lastResults = [];
let userMarker = null;
let routingControl = null;
let currentDestination = null;
let showAllEnabled = true;

// route / follow state
let routeCoords = [];
let lastRouteOrigin = null;
let pendingFit = false;
let followMode = false;
let firstFixDone = false;
let gpsHeading = null;
let compassHeading = null;
let compassStarted = false;
let lastCompassTs = 0;
let smoothedHeading = null;
let lastAppliedHeading = null;

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/locations'
    : '/api/locations';

/* =====================  ICONS, COLOURS, GIRLS / MEN DORMS  ===================== */
/* CLASSIFY START */

// Girls dorms: Twins P,Q,R,S,M,L,H  and  Hayat B,C,D  (every other dorm = men's dorm)
const GIRLS_DORMS = {
    twins: 'pqrsmlh',
    hayat: 'bcd',
    wings: '1'
};

const COLORS = {
    girls: '#ec4899',      // pink
    men: '#2563eb',        // blue
    Academic: '#0f766e',
    Administrative: '#7c3aed',
    Service: '#d97706',
    Dining: '#ea580c',
    Library: '#4f46e5',
    Gate: '#475569',
    Hall: '#92400e',
    Sports: '#16a34a',
    Health: '#dc2626',
    Religious: '#a16207',
    Office: '#0e7490',
    Other: '#0f172a'
};

// First matching rule wins (matched against the lower-case name)
const NAME_ICONS = [
    [/hospital|clinic/, '🏥'],
    [/church|ቤተ ክርስቲያን|fellowship|mkc/, '⛪'],
    [/gate/, '🚪'],
    [/library/, '📚'],
    [/stadium/, '🏟️'],
    [/basketball/, '🏀'],
    [/cafe/, '☕'],
    [/bank/, '🏦'],
    [/book ?store/, '📖'],
    [/post office/, '📮'],
    [/day ?care/, '🧸'],
    [/police/, '👮'],
    [/peace/, '🕊️'],
    [/cost sharing/, '💰'],
    [/student service/, '🙋'],
    [/president/, '👔'],
    [/registrar/, '🗂️'],
    [/dormitory office/, '🛎️'],
    [/incubation/, '💡'],
    [/\bict\b|computing/, '💻'],
    [/electrical|computer/, '⚡'],
    [/architecture/, '📐'],
    [/textile|fashion/, '🧵'],
    [/chemical|bio/, '🧪'],
    [/laborator/, '🔬'],
    [/stem/, '🔭'],
    [/workshop/, '🔧'],
    [/medicine|health/, '🩺'],
    [/\blaw\b|moot/, '⚖️'],
    [/business|econom/, '💼'],
    [/political|international/, '🌐'],
    [/social science/, '👥'],
    [/post graduate/, '🎓'],
    [/natural science/, '🔬'],
    [/technology/, '⚙️'],
    [/secondary school/, '🏫'],
    [/hall/, '🏛️']
];

const CATEGORY_ICONS = {
    academic: '🏫',
    administrative: '🏢',
    service: '🛎️',
    dining: '☕',
    sports: '⚽',
    health: '🏥',
    library: '📚',
    gate: '🚪',
    hall: '🏛️',
    office: '🛎️'
};

function isGirlsDorm(name) {
    const m = String(name).trim().match(/^([a-z]+)\s*-\s*([a-z0-9])$/i);
    if (!m) return false;
    const letters = GIRLS_DORMS[m[1].toLowerCase()];
    return !!letters && letters.includes(m[2].toLowerCase());
}

function classify(loc) {
    const name = String(loc.name || '').trim();
    const lname = name.toLowerCase();
    const cat = String(loc.category || '').trim();
    const lcat = cat.toLowerCase();

    // Dormitories: pink + 👩 for girls, blue + 👨 for men
    if (lcat === 'dormitory') {
        const girls = isGirlsDorm(name);
        return {
            emoji: girls ? '👩' : '👨',
            color: girls ? COLORS.girls : COLORS.men,
            tag: girls ? 'Girls Dorm' : "Men's Dorm",
            girls: girls
        };
    }

    let emoji = null;
    for (const [re, icon] of NAME_ICONS) {
        if (re.test(lname)) { emoji = icon; break; }
    }
    if (!emoji) emoji = CATEGORY_ICONS[lcat] || '📍';

    const religious = emoji === '⛪';
    let tag = cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : (religious ? 'Religious' : 'Other');
    let color = religious ? COLORS.Religious : (COLORS[tag] || COLORS.Other);

    return { emoji: emoji, color: color, tag: tag, girls: false };
}
/* CLASSIFY END */

/* =====================  MENU (circle icon)  ===================== */

function openMenu() {
    document.body.classList.add('menu-open');
    document.getElementById('menu-toggle').innerText = '✕';
}

function closeMenu() {
    document.body.classList.remove('menu-open');
    document.getElementById('menu-toggle').innerText = '☰';
    searchBox.blur();
}

function toggleMenu() {
    document.body.classList.contains('menu-open') ? closeMenu() : openMenu();
}

// Full map launch (no ?dest=) starts with the menu open; direct destinations start hidden
if (!hasDestParam) openMenu();

/* =====================  LOAD DATA  ===================== */

// Short names used by older bot buttons -> exact location name
const DEST_ALIASES = {
    'computing': 'Block-15 (School of Computing)',
    'library': 'Block-32 Main Library'
};

function findRequestedDestination(query) {
    const q = String(query || '').trim().toLowerCase();
    const same = (loc, text) => loc.name.toLowerCase() === String(text).toLowerCase();

    let hit = allLocations.find(loc => same(loc, q));                       // 1) exact name
    if (!hit && DEST_ALIASES[q]) hit = allLocations.find(loc => same(loc, DEST_ALIASES[q])); // 2) alias
    if (!hit) hit = allLocations.find(loc => loc.name.toLowerCase().includes(q));            // 3) partial
    if (!hit) hit = allLocations.find(loc => same(loc, DEST_ALIASES['computing']));          // 4) default
    return hit || allLocations[0];
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' });

async function loadLocations() {
    try {
        let response = await fetch(API_URL);
        const raw = await response.json();

        // Clean data: trim names, keep only entries with real coordinates, A-Z order
        allLocations = raw
            .map(loc => ({ ...loc, name: String(loc.name || '').trim(), lat: Number(loc.lat), lng: Number(loc.lng) }))
            .filter(loc => {
                const ok = loc.name && isFinite(loc.lat) && isFinite(loc.lng);
                if (!ok) console.warn('Skipped location with bad data:', loc);
                return ok;
            })
            .sort(byName);

        allLocations.forEach(loc => { loc._k = classify(loc); });

        renderList(allLocations);
        renderMarkers(allLocations);

        const target = findRequestedDestination(requestedDest);
        if (target) {
            setDestination(target);
        }
    } catch (error) {
        console.error("Error loading locations:", error);
        statusBanner.innerText = "⚠️ Failed to load campus locations.";
    }
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* =====================  MARKERS  ===================== */

function makePinIcon(loc) {
    const k = loc._k;
    return L.divIcon({
        className: 'poi-wrap',
        html: `<div class="poi" style="--pin:${k.color}">
                   <div class="poi-label${k.girls ? ' girls' : ''}">${escapeHtml(loc.name)}</div>
                   <div class="poi-pin"><span>${k.emoji}</span></div>
               </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 34]
    });
}

function renderMarkers(locations) {
    markersMap.forEach((marker) => map.removeLayer(marker));
    markersMap.clear();

    const seen = {};
    let placed = 0;

    locations.forEach(loc => {
        // Two places with identical coordinates would hide each other: nudge the pin ~6 m (display only)
        const key = loc.lat.toFixed(6) + ',' + loc.lng.toFixed(6);
        const n = seen[key] = (seen[key] || 0) + 1;
        const lng = loc.lng + (n - 1) * 0.00006;

        const marker = L.marker([loc.lat, lng], { icon: makePinIcon(loc), riseOnHover: true });
        marker.on('click', () => setDestination(loc));

        if (showAllEnabled || (currentDestination && currentDestination.name === loc.name)) {
            marker.addTo(map);
        }

        markersMap.set(loc.name, marker);
        placed++;
    });

    if (placed !== locations.length) console.warn(`Only ${placed}/${locations.length} locations placed on the map`);
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

/* =====================  SEARCH  ===================== */

function highlight(text, terms) {
    if (!terms.length) return escapeHtml(text);
    const lower = text.toLowerCase();
    const ranges = [];
    terms.forEach(t => {
        let i = lower.indexOf(t);
        while (i !== -1) {
            ranges.push([i, i + t.length]);
            i = lower.indexOf(t, i + t.length);
        }
    });
    if (!ranges.length) return escapeHtml(text);

    ranges.sort((a, b) => a[0] - b[0]);
    const merged = [ranges[0].slice()];
    for (let k = 1; k < ranges.length; k++) {
        const last = merged[merged.length - 1];
        if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
        else merged.push(ranges[k].slice());
    }

    let out = '';
    let pos = 0;
    merged.forEach(([s, e]) => {
        out += escapeHtml(text.slice(pos, s)) + '<mark>' + escapeHtml(text.slice(s, e)) + '</mark>';
        pos = e;
    });
    return out + escapeHtml(text.slice(pos));
}

/* Relevance score: every typed word must match somewhere, otherwise 0.
   Exact name > name starts with > a word in the name starts with > name contains > category/type contains */
function scoreLocation(loc, terms) {
    const name = String(loc.name || '').toLowerCase();
    const cat = (String(loc.category || '') + ' ' + (loc._k ? loc._k.tag : '')).toLowerCase();
    const words = name.split(/[^a-z0-9\u1200-\u137F]+/).filter(Boolean);
    let total = 0;

    for (const t of terms) {
        let s;
        if (name === t) s = 100;
        else if (name.startsWith(t)) s = 80;
        else if (words.some(w => w.startsWith(t))) s = 60;
        else if (name.includes(t)) s = 40;
        else if (cat.includes(t)) s = 20;
        else return 0;
        total += s;
    }
    return total;
}

function renderList(locations, terms = []) {
    const listContainer = document.getElementById('building-list');
    const countEl = document.getElementById('result-count');
    listContainer.innerHTML = '';
    lastResults = locations;

    if (terms.length) {
        countEl.innerText = `${locations.length} result${locations.length === 1 ? '' : 's'} found`;
    } else {
        countEl.innerText = `${locations.length} locations (A → Z)`;
    }

    if (!locations.length) {
        const empty = document.createElement('div');
        empty.className = 'no-results';
        empty.innerText = 'No matching place found. Try another word.';
        listContainer.appendChild(empty);
        return;
    }

    locations.forEach(loc => {
        const k = loc._k || classify(loc);
        let item = document.createElement('div');
        item.className = 'building-item' + (k.girls ? ' girls' : '');
        item.innerHTML = `
            <div class="item-icon" style="--pin:${k.color}">${k.emoji}</div>
            <div class="item-text">
                <h4>${highlight(String(loc.name), terms)}</h4>
                <span>${highlight(k.tag, terms)}</span>
            </div>
        `;
        item.onclick = () => selectLocation(loc);
        listContainer.appendChild(item);
    });
}

// Ranked partial-word search (one word or several); empty search = full A-Z list
function filterLocations() {
    const query = searchBox.value.toLowerCase().trim();
    if (!query) {
        renderList(allLocations);
        return;
    }

    const terms = query.split(/\s+/);
    const results = allLocations
        .map(loc => ({ loc, score: scoreLocation(loc, terms) }))
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score || byName(a.loc, b.loc))
        .map(r => r.loc);

    renderList(results, terms);
}

// Enter key = go to the best match
function onSearchKey(e) {
    if (e.key === 'Enter' && lastResults.length) {
        e.preventDefault();
        selectLocation(lastResults[0]);
    }
}

// Picking from the list: set destination and hide the menu so the map is clear
function selectLocation(loc) {
    setDestination(loc);
    closeMenu();
}

/* =====================  DESTINATION & ROUTE  ===================== */

function setDestination(loc) {
    currentDestination = loc;
    statusBanner.innerText = `🎯 Navigating to ${loc.name}`;

    markersMap.forEach((marker, name) => {
        if (showAllEnabled || name === loc.name) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
    });

    pendingFit = true;

    if (userMarker) {
        updateRoute(userMarker.getLatLng(), [loc.lat, loc.lng], true);
    } else {
        map.setView([loc.lat, loc.lng], 18);
    }
}

const userLiveIcon = L.divIcon({
    className: 'user-position-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
});

function updateRoute(startLatLng, destCoords, force = false) {
    if (!currentDestination) return;

    const start = L.latLng(startLatLng.lat, startLatLng.lng);

    // Don't hammer the routing server: only recalculate after moving 15 m (or a new destination)
    if (routingControl && !force && lastRouteOrigin && start.distanceTo(lastRouteOrigin) < 15) return;
    lastRouteOrigin = start;

    const waypoints = [start, L.latLng(destCoords[0], destCoords[1])];

    if (!routingControl) {
        routingControl = L.Routing.control({
            waypoints: waypoints,
            router: L.Routing.osrmv1({
                serviceUrl: 'https://router.project-osrm.org/route/v1',
                profile: 'foot'
            }),
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            showAlternatives: false,
            fitSelectedRoutes: false,      // we control zoom ourselves (needed for follow mode)
            collapsible: true,
            position: 'bottomleft',
            createMarker: () => null,      // our own markers/user dot are enough
            lineOptions: {
                styles: [{ color: '#38bdf8', opacity: 0.9, weight: 6 }]
            }
        }).addTo(map);

        routingControl.on('routesfound', (e) => {
            routeCoords = e.routes[0].coordinates || [];
            if (pendingFit && !followMode && routeCoords.length) {
                map.fitBounds(L.latLngBounds(routeCoords), { padding: [50, 50] });
            }
            pendingFit = false;
        });

        routingControl.on('routingerror', () => {
            routeCoords = [];
            statusBanner.innerText = '⚠️ Route unavailable, follow the straight direction.';
        });
    } else {
        routingControl.setWaypoints(waypoints);
    }
}

/* =====================  DIRECTION / MAP ROTATION  ===================== */

function angleDiff(a, b) {
    return ((a - b + 540) % 360) - 180;
}

function bearingBetween(a, b) {
    const rad = d => d * Math.PI / 180;
    const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lng - a.lng);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Direction of the next point on the walking route (~20 m ahead), else straight to the destination
function routeBearing(from) {
    if (routeCoords.length) {
        let idx = 0, min = Infinity;
        routeCoords.forEach((c, i) => {
            const d = from.distanceTo(c);
            if (d < min) { min = d; idx = i; }
        });
        for (let i = idx; i < routeCoords.length; i++) {
            if (from.distanceTo(routeCoords[i]) > 20) return bearingBetween(from, routeCoords[i]);
        }
    }
    if (currentDestination) {
        return bearingBetween(from, L.latLng(currentDestination.lat, currentDestination.lng));
    }
    return null;
}

// Rotate the map so the direction you are heading points UP the screen
function applyFollowHeading() {
    if (!followMode || !userMarker || typeof map.setBearing !== 'function') return;

    const here = userMarker.getLatLng();
    // Priority: GPS heading while walking > phone compass > route direction
    const h = gpsHeading != null ? gpsHeading
        : compassHeading != null ? compassHeading
        : routeBearing(here);
    if (h == null) return;

    smoothedHeading = smoothedHeading == null
        ? h
        : (smoothedHeading + angleDiff(h, smoothedHeading) * 0.3 + 360) % 360;

    if (lastAppliedHeading == null || Math.abs(angleDiff(smoothedHeading, lastAppliedHeading)) > 2) {
        lastAppliedHeading = smoothedHeading;
        map.setBearing((ROTATION_SIGN * smoothedHeading + 360) % 360);
    }
}

function onOrient(e) {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') {
        heading = e.webkitCompassHeading;                       // iOS
    } else if (e.absolute && typeof e.alpha === 'number') {
        heading = (360 - e.alpha) % 360;                        // Android
    }
    if (heading == null) return;

    heading = (heading + ((screen.orientation && screen.orientation.angle) || 0) + 360) % 360;
    compassHeading = heading;

    const now = Date.now();
    if (now - lastCompassTs < 120) return;
    lastCompassTs = now;
    applyFollowHeading();
}

async function enableCompass() {
    if (compassStarted) return;
    compassStarted = true;
    try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            const result = await DeviceOrientationEvent.requestPermission(); // iOS needs a tap
            if (result !== 'granted') { compassStarted = false; return; }
        }
        window.addEventListener('deviceorientationabsolute', onOrient, true);
        window.addEventListener('deviceorientation', onOrient, true);
    } catch (err) {
        compassStarted = false;
    }
}

function setFollow(on) {
    followMode = on;
    followBtn.classList.toggle('active', on);

    if (on) {
        enableCompass();
        closeMenu();
        if (userMarker) {
            map.setView(userMarker.getLatLng(), Math.max(map.getZoom(), 19), { animate: true });
            applyFollowHeading();
        } else {
            statusBanner.innerText = '📡 Waiting for GPS... allow location & turn on GPS';
        }
    } else {
        smoothedHeading = null;
        lastAppliedHeading = null;
        if (typeof map.setBearing === 'function') map.setBearing(0); // back to north-up
    }
}

function toggleFollow() {
    setFollow(!followMode);
}

// If the user drags the map to look around, stop following (tap 🧭 to resume)
map.on('dragstart', () => {
    if (followMode) setFollow(false);
});

/* =====================  GPS  ===================== */

if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
        (position) => {
            let lat = position.coords.latitude;
            let lng = position.coords.longitude;
            let latLng = L.latLng(lat, lng);

            const speed = position.coords.speed;
            const hdg = position.coords.heading;
            gpsHeading = (speed != null && speed > 1 && hdg != null && !isNaN(hdg)) ? hdg : null;

            if (!userMarker) {
                userMarker = L.marker(latLng, { icon: userLiveIcon, zIndexOffset: 2000 })
                    .addTo(map)
                    .bindPopup("<b>📱 You are here</b>");
            } else {
                userMarker.setLatLng(latLng);
            }

            if (currentDestination) {
                updateRoute(latLng, [currentDestination.lat, currentDestination.lng]);
                statusBanner.innerText = `🎯 Navigating to ${currentDestination.name}`;
            }

            if (!firstFixDone) {
                firstFixDone = true;
                if (currentDestination) setFollow(true); // start navigation: follow + rotate automatically
            } else if (followMode) {
                map.setView(latLng, map.getZoom(), { animate: true });
                applyFollowHeading();
            }
        },
        (error) => {
            console.warn("GPS error:", error.message);
            if (error.code === 1) {
                statusBanner.innerText = "⚠️ Location permission denied. Allow location for this app in your phone/Telegram settings.";
            } else if (error.code === 2) {
                statusBanner.innerText = "⚠️ Location is off. Turn ON your phone's Location/GPS.";
            } else {
                statusBanner.innerText = "⚠️ GPS signal unavailable. Tap any building to view.";
            }
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
}

loadLocations();