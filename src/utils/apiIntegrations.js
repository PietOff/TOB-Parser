/**
 * External API integrations for enriching TOB data
 * 
 * All APIs used are free, open Dutch government services:
 * - PDOK Locatieserver: geocoding, address search, coordinates
 * - BAG API: building/address details (bouwjaar, oppervlakte, gebruiksdoel)
 * - Topotijdreis: historical map links for visual reference
 * - Bodemloket: soil data links
 * - Nazca: location code lookup via Bodemloket search
 */

const PDOK_LOCATIE_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const BAG_API_BASE = 'https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2';
const TOPOTIJDREIS_BASE = 'https://www.topotijdreis.nl';

// Common Dutch cities for context extraction
const DUTCH_CITIES = [
    'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg', 'Almere', 'Breda', 'Nijmegen',
    'Apeldoorn', 'Haarlem', 'Enschede', 'Arnhem', 'Amersfoort', 'Zaanstad', 'Den Bosch', 'Haarlemmermeer', 'Zwolle', 'Zoetermeer',
    'Leiden', 'Maastricht', 'Dordrecht', 'Ede', 'Alphen aan den Rijn', 'Leeuwarden', 'Alkmaar', 'Emmen', 'Delft', 'Venlo',
    'Deventer', 'Sittard-Geleen', 'Oss', 'Helmond', 'Heerlen', 'Hilversum', 'Amstelveen', 'Nissewaard', 'Hengelo', 'Súdwest-Fryslân',
    'Purmerend', 'Schiedam', 'Lelystad', 'Vlaardingen', 'Almelo', 'Hoorn', 'Velsen', 'Gouda', 'Assen', 'Capelle aan den IJssel',
    'Katwijk', 'Veenendaal', 'Doetinchem', 'Nieuwegein', 'Roermond', 'Den Helder', 'Hoogeveen', 'Terneuzen', 'Harderwijk', 'Barneveld'
];

/**
 * Detect a Dutch city name in a string
 */
export function detectCityFromText(text) {
    if (!text) return null;
    const normalized = text.toLowerCase();
    for (const city of DUTCH_CITIES) {
        // Use word boundary to avoid partial matches (e.g., "Ede" in "Nederland")
        const regex = new RegExp(`\\b${city.toLowerCase()}\\b`, 'i');
        if (regex.test(normalized)) {
            return city;
        }
    }
    return null;
}

// GitHub token: reads from Vercel env var first, then localStorage
export function getGithubToken() {
    return import.meta.env.VITE_GITHUB_TOKEN || localStorage.getItem('github_token') || null;
}

// ══════════════════════════════════════
// Nazca Location Code Lookup
// ══════════════════════════════════════

/**
 * Look up a Nazca location code via the Bodemloket/PDOK system.
 * Nazca codes are used in Dutch environmental management (Tauw, Rijkswaterstaat).
 * Returns any matching soil investigation records.
 */
export async function lookupNazcaCode(nazcaCode) {
    try {
        console.log(`🔍 [Nazca] Looking up code: ${nazcaCode}`);

        // Try PDOK Locatieserver first (some Nazca codes map to known addresses)
        const pdokResults = await pdokSearch(nazcaCode);
        if (pdokResults.length > 0) {
            console.log(`✅ [Nazca] Found via PDOK: ${pdokResults[0].weergavenaam}`);
            return {
                found: true,
                source: 'PDOK',
                address: pdokResults[0].weergavenaam,
                data: pdokResults[0]
            };
        }

        // Fallback: try searching by code pattern (e.g., "T-2345" or "LOC-001")
        // Some codes encode municipality info
        const codeMatch = nazcaCode.match(/^([A-Z]+)-?(\d+)/);
        if (codeMatch) {
            const prefix = codeMatch[1];
            const results = await pdokSearch(`${prefix} ${nazcaCode}`);
            if (results.length > 0) {
                return {
                    found: true,
                    source: 'PDOK (prefix match)',
                    address: results[0].weergavenaam,
                    data: results[0]
                };
            }
        }

        console.log(`⚠️ [Nazca] Code "${nazcaCode}" not found in PDOK/Bodemloket.`);
        return { found: false, source: null, data: null };
    } catch (err) {
        console.warn(`❌ [Nazca] Lookup failed for "${nazcaCode}":`, err);
        return { found: false, source: null, data: null };
    }
}

// ══════════════════════════════════════════════
// PDOK Locatieserver — geocoding & address data
// ══════════════════════════════════════════════

/**
 * Search for an address using PDOK Locatieserver
 * Returns geocoded results with coordinates and address details
 * - cityContext: filter by city name (woonplaatsnaam)
 * - postcodeContext: filter by postcode (e.g. "1234AB") — most precise
 */
export async function pdokSearch(query, cityContext = null, postcodeContext = null, rows = 5) {
    try {
        let url = `${PDOK_LOCATIE_BASE}/free?q=${encodeURIComponent(query)}&rows=${rows}`;
        // Postcode filter is more precise than city — prefer it when available
        if (postcodeContext) {
            // Normalise: PDOK wants "1234 AB" with space
            const pc = postcodeContext.replace(/\s+/g, '').toUpperCase();
            url += `&fq=postcode:${encodeURIComponent(pc.slice(0, 4) + ' ' + pc.slice(4))}`;
        } else if (cityContext) {
            url += `&fq=woonplaatsnaam:${encodeURIComponent(cityContext)}`;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`PDOK: ${res.status}`);
        const data = await res.json();

        return (data.response?.docs || []).map(doc => ({
            weergavenaam: doc.weergavenaam,
            type: doc.type,
            straatnaam: doc.straatnaam,
            huisnummer: doc.huisnummer,
            postcode: doc.postcode,
            woonplaats: doc.woonplaatsnaam,
            gemeente: doc.gemeentenaam,
            provincie: doc.provincienaam,
            // Centroid as RD coordinates
            centroide_rd: doc.centroide_rd,
            // Centroid as lat/lng
            centroide_ll: doc.centroide_ll,
            nummeraanduidingId: doc.nummeraanduiding_id,
            adresseerbaarobjectId: doc.adresseerbaarobject_id,
            bouwjaar: doc.bouwjaar, // Available in some PDOK results
        }));
    } catch (err) {
        console.warn('PDOK search failed:', err);
        return [];
    }
}

/**
 * Reverse geocode from RD coordinates
 */
export async function pdokReverse(x, y) {
    try {
        const url = `${PDOK_LOCATIE_BASE}/reverse?X=${x}&Y=${y}&rows=3`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`PDOK reverse: ${res.status}`);
        const data = await res.json();
        return (data.response?.docs || []).map(doc => ({
            weergavenaam: doc.weergavenaam,
            type: doc.type,
            straatnaam: doc.straatnaam,
            huisnummer: doc.huisnummer ? String(doc.huisnummer) : null,
            postcode: doc.postcode,
            woonplaats: doc.woonplaatsnaam,
            gemeente: doc.gemeentenaam,
            afstand: doc.afstand,
        }));
    } catch (err) {
        console.warn('PDOK reverse failed:', err);
        return [];
    }
}

/**
 * Auto-suggest addresses (for search-as-you-type)
 */
export async function pdokSuggest(query) {
    try {
        const url = `${PDOK_LOCATIE_BASE}/suggest?q=${encodeURIComponent(query)}&rows=7`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`PDOK suggest: ${res.status}`);
        const data = await res.json();
        return (data.response?.docs || []).map(doc => ({
            weergavenaam: doc.weergavenaam,
            type: doc.type,
            id: doc.id,
        }));
    } catch (err) {
        console.warn('PDOK suggest failed:', err);
        return [];
    }
}

// ══════════════════════════════════════
// PDOK Bodemkwaliteitskaart (WFS)
// ══════════════════════════════════════

// Helper to bypass CORS for PDOK WFS services
// We use allorigins.win but need to use /get instead of /raw to reliably parse JSON
const PROXY = 'https://api.allorigins.win/get?url=';

async function fetchWithProxy(url) {
    try {
        const res = await fetch(PROXY + encodeURIComponent(url));
        if (!res.ok) {
            console.warn(`Proxy warning for ${url}: ${res.status}`);
            return null;
        }
        const data = await res.json();
        if (!data.contents) return null;
        return JSON.parse(data.contents);
    } catch (e) {
        console.warn(`Fetch error via proxy for ${url}:`, e);
        return null; // Return null gracefully instead of throwing to prevent Promise.all crashes
    }
}

/**
 * Get bodemkwaliteitskaart data for a given location (RD coordinates)
 */
export async function getBodemkwaliteit(rdX, rdY, buffer = 50) {
    try {
        const bbox = `${rdX - buffer},${rdY - buffer},${rdX + buffer},${rdY + buffer}`;
        const originalUrl = `https://service.pdok.nl/provincies/bodemkwaliteit/wfs/v1_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bodemkwaliteit:bodemkwaliteitskaart&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=5`;

        const data = await fetchWithProxy(originalUrl);
        if (!data) return null;

        if (data.features?.length > 0) {
            return data.features.map(f => ({
                klasse: f.properties?.bodemkwaliteitsklasse || f.properties?.klasse,
                laag: f.properties?.bodemlaag || f.properties?.laag,
                gemeente: f.properties?.gemeentenaam,
                bron: 'PDOK Bodemkwaliteitskaart',
            }));
        }
        return null;
    } catch (err) {
        console.warn('Bodemkwaliteit query data mapping failed:', err);
        return null;
    }
}

/**
 * Get HBB (Historisch Bodem Bestand) data: activities and asbestos suspicion
 */
export async function getHbbData(rdX, rdY, buffer = 25) {
    try {
        const bbox = `${rdX - buffer},${rdY - buffer},${rdX + buffer},${rdY + buffer}`;
        const originalUrl = `https://service.pdok.nl/provincies/bodemkwaliteit/wfs/v1_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bodemkwaliteit:hbb_activiteit,bodemkwaliteit:hbb_asbestverdacht&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=10`;

        const data = await fetchWithProxy(originalUrl);
        if (!data) return null;

        return (data.features || []).map(f => ({
            naam: f.properties.naam || f.properties.activiteit,
            type: f.id.includes('asbest') ? 'Asbestverdacht' : 'Activiteit',
            bron: 'HBB (Historisch Bodem Bestand)',
        }));
    } catch (err) {
        console.warn('HBB query data mapping failed:', err);
        return null;
    }
}

// ══════════════════════════════════════
// Topotijdreis — historical map links
// ══════════════════════════════════════

/**
 * Generate Topotijdreis URL for a specific location and year
 * Uses RD coordinates (x, y) and a year
 */
export function getTopotijdreisUrl(rdX, rdY, year = null, zoom = 11) {
    const params = new URLSearchParams({
        x: Math.round(rdX),
        y: Math.round(rdY),
        l: zoom,
        datatype: 'maps',
    });
    if (year) params.set('year', year);
    return `${TOPOTIJDREIS_BASE}?${params.toString()}`;
}

/**
 * Generate multiple Topotijdreis links for key historical years
 * Useful for vooronderzoek: check historical land use
 */
export function getHistorischeKaartLinks(rdX, rdY) {
    const keyYears = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
    return keyYears.map(year => ({
        jaar: year,
        url: getTopotijdreisUrl(rdX, rdY, year),
        label: `Topografische kaart ${year}`,
    }));
}

// ══════════════════════════════════════
// Bodemloket — link generation
// ══════════════════════════════════════

/**
 * Generate Bodemloket link for a location
 * Bodemloket doesn't have a direct API but supports URL parameters
 */
export function getBodemloketUrl(rdX, rdY) {
    // Bodemloket viewer built on ArcGIS accepts ?center=<X>,<Y>,28992
    return `https://www.bodemloket.nl/kaart?center=${Math.round(rdX)},${Math.round(rdY)},28992`;
}

import proj4 from 'proj4';

// Define RD (EPSG:28992) and WGS84 (EPSG:4326)
const RD = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs';
const WGS84 = 'EPSG:4326';

/**
 * Extract trace coordinates from TOB text
 * Looks for patterns like:
 * - "tracé loopt van (123456, 456789) naar (123457, 456790)"
 * - Coordinates in format: (X, Y) or X, Y or X Y
 * Returns array of [lat, lng] pairs suitable for Leaflet
 */
export function extractTraceCoordinates(text) {
    if (!text) return [];

    // Pattern 1: Dutch descriptions with coordinates
    // "tracé loopt van X Y naar X Y" or "van (X,Y) naar (X,Y)"
    const rdPattern = /[\(\s](\d{5,6})[,\s]+(\d{6,7})[\)\s]/g;
    const coordinates = [];
    let match;

    const uniqueCoords = new Set();
    while ((match = rdPattern.exec(text)) !== null) {
        const x = parseFloat(match[1]);
        const y = parseFloat(match[2]);

        // RD coordinates are typically between 12000-300000 for X and 300000-625000 for Y
        if (x > 10000 && x < 300000 && y > 300000 && y < 700000) {
            const key = `${x},${y}`;
            if (!uniqueCoords.has(key)) {
                uniqueCoords.add(key);
                const wgs84 = rdToWgs84(x, y);
                coordinates.push([wgs84.lat, wgs84.lng]);
            }
        }
    }

    return coordinates;
}

/**
 * Convert WGS84 (lat/lng) to RD (Rijksdriehoek) coordinates
 */
export function wgs84ToRd(lat, lng) {
    const [x, y] = proj4(WGS84, RD, [lng, lat]);
    return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Convert RD to WGS84 (lat/lng)
 */
export function rdToWgs84(x, y) {
    const [lng, lat] = proj4(RD, WGS84, [x, y]);
    return { lat, lng };
}

// ══════════════════════════════════════
// Enrich location with external data
// ══════════════════════════════════════

/**
 * Get building details (oorspronkelijk bouwjaar) from BAG WFS
 * This is crucial for asbestos suspicion (1945-1995)
 */
export async function getBuildingDetails(rdX, rdY, buffer = 10) {
    try {
        const bbox = `${rdX - buffer},${rdY - buffer},${rdX + buffer},${rdY + buffer}`;
        const originalUrl = `https://service.pdok.nl/kadaster/bag/wfs/v2_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bag:pand&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=10`;

        const data = await fetchWithProxy(originalUrl);
        // Check for error object returned by fetchWithProxy
        if (data && data.error) {
            console.warn(`BAG WFS query failed for ${originalUrl}:`, data.error);
            return null;
        }
        if (!data) return null;

        return (data.features || []).map(f => ({
            id: f.properties.identificatie,
            status: f.properties.status,
            bouwjaar: f.properties.oorspronkelijkbouwjaar,
            bron: 'BAG Pand WFS',
        }));
    } catch (err) {
        console.warn('BAG WFS query mapping failed:', err);
        return null;
    }
}

/**
 * Clean address queries by removing Dutch suffixes that confuse PDOK geocoding
 */
function cleanAddressQuery(query) {
    if (!query) return '';
    return query
        .replace(/\b(e\.?o\.?|eo)\b/gi, '')                    // "e.o." = en omgeving
        .replace(/\b(t\.?h\.?v\.?)\b/gi, '')                    // "t.h.v." = ter hoogte van
        .replace(/\b(t\.?\/m\.?|t\/m)\b/gi, '')                // "t/m" = tot en met
        .replace(/\b(nabij|omgeving|terrein|perceel)\b/gi, '')  // general location terms
        .replace(/\b(e\.v\.?|ev\.)\b/gi, '')                    // "e.v." = en verder
        .replace(/\b(ca\.?)\b/gi, '')                            // "ca." = circa
        .replace(/\b(ongen\.?|ong\.?)\b/gi, '')                  // "ongenummerd" / "ong."
        .replace(/\s*[-–]\s*/g, ' ')                             // dashes to spaces
        .replace(/\s{2,}/g, ' ')                                 // multi-space collapse
        .trim();
}

/**
 * Try to extract a street name from a locatienaam string
 * Examples: "Nieuwe Stationsstraat e.o." → "Nieuwe Stationsstraat"
 *           "terrein Laan van Westenenk" → "Laan van Westenenk"
 */
function extractStreetFromName(name) {
    if (!name) return null;
    // Dutch street suffixes that help identify a street name embedded in a project name
    const streetSuffixes = /(?:straat|laan|weg|plein|singel|gracht|kade|dijk|dreef|steeg|pad|hof|ring|baan|allee|boulevard|markt|park)\b/i;
    const cleaned = cleanAddressQuery(name);
    if (streetSuffixes.test(cleaned)) {
        // Remove leading non-street words like "terrein", "locatie", "project"
        return cleaned.replace(/^(terrein|locatie|project|gebied|perceel|bouwlocatie)\s+/i, '').trim();
    }
    return null;
}

// ══════════════════════════════════════
// Centroid helpers
// ══════════════════════════════════════

/**
 * Parse RD coordinates from a PDOK centroide_rd string like "POINT(155000 463000)"
 */
function parseRdCoords(centroide_rd) {
    if (!centroide_rd) return null;
    const m = centroide_rd.match(/POINT\s*\((\d+\.?\d*)\s+(\d+\.?\d*)\)/);
    if (!m) return null;
    return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

/**
 * Parse WGS84 lat/lng from a PDOK centroide_ll string like "POINT(5.38763 52.15616)"
 */
function parseLlCoords(centroide_ll) {
    if (!centroide_ll) return null;
    const m = centroide_ll.match(/POINT\s*\((-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)/);
    if (!m) return null;
    return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

/**
 * From a list of PDOK results, return the one whose RD coordinates are closest
 * to the project centroid. Falls back to results[0] when no centroid is available.
 */
function pickClosestResult(results, centroid) {
    if (!results || results.length === 0) return null;
    if (!centroid || results.length === 1) return results[0];

    let best = results[0];
    let bestDist = Infinity;
    for (const r of results) {
        const rd = parseRdCoords(r.centroide_rd);
        if (!rd) continue;
        const dx = rd.x - centroid.x;
        const dy = rd.y - centroid.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
            bestDist = dist;
            best = r;
        }
    }
    if (bestDist < Infinity) {
        console.log(`🎯 [Centroid] Picked closest result (${Math.round(bestDist)}m from centroid): ${best.weergavenaam}`);
    }
    return best;
}

/**
 * Quick-geocode a location using only PDOK (no BAG/HBB), to build the project centroid.
 * Only used in Phase 1 of enrichAllLocations.
 */
async function quickGeocode(location) {
    const street = cleanAddressQuery(location.straatnaam);
    const baseAddr = [street, location.huisnummer].filter(Boolean).join(' ');
    const postcode = location.postcode ? location.postcode.replace(/\s+/g, '').toUpperCase() : null;
    if (!baseAddr) return null;

    try {
        const results = await pdokSearch(baseAddr, null, postcode, 3);
        if (results.length === 0) return null;
        const rd = parseRdCoords(results[0].centroide_rd);
        if (rd) {
            console.log(`🧭 [Phase1] Anchor "${location.straatnaam} ${location.huisnummer || ''}" → RD(${Math.round(rd.x)}, ${Math.round(rd.y)})`);
        }
        return rd;
    } catch {
        return null;
    }
}

/**
 * Enrich a single TOB location with data from all available APIs
 * contextPostcode: postcode from a nearby/same-street location
 * primaryCity: most frequent city in the dataset
 * datasetPostcodes: all postcodes found across the entire dataset (used as geo-context)
 * projectCentroid: RD {x, y} of the project area centre — used to pick closest PDOK result
 */
export async function enrichLocation(location, contextPostcode = null, primaryCity = null, datasetPostcodes = [], projectCentroid = null) {
    const enriched = { ...location, _enriched: {} };

    // Step 0: Detect and try Nazca location code lookup
    const nazcaPattern = /^[A-Z]{1,5}[-_]?\d{2,}/i;
    if (location.locatiecode && nazcaPattern.test(location.locatiecode) && !location.straatnaam) {
        console.log(`🔎 [Nazca] Detected potential Nazca code: ${location.locatiecode}`);
        const nazcaResult = await lookupNazcaCode(location.locatiecode);
        if (nazcaResult.found) {
            enriched._enriched._nazca = nazcaResult;
            if (nazcaResult.data) {
                if (!enriched.straatnaam && nazcaResult.data.straatnaam) enriched.straatnaam = nazcaResult.data.straatnaam;
                if (!enriched.huisnummer && nazcaResult.data.huisnummer) enriched.huisnummer = nazcaResult.data.huisnummer;
                if (!enriched.postcode && nazcaResult.data.postcode) enriched.postcode = nazcaResult.data.postcode;
                if (!enriched.woonplaats && nazcaResult.data.woonplaats) enriched.woonplaats = nazcaResult.data.woonplaats;
            }
        }
    }

    // Step 1: Smart Address Resolution
    // Try to extract a street name from locatienaam if no explicit street is set
    let effectiveStreet = location.straatnaam;
    if (!effectiveStreet && location.locatienaam) {
        effectiveStreet = extractStreetFromName(location.locatienaam);
        if (effectiveStreet) {
            console.log(`🔍 [Address] Extracted street "${effectiveStreet}" from locatienaam "${location.locatienaam}"`);
        }
    }

    const effectivePostcode = location.postcode
        ? location.postcode.replace(/\s+/g, '').toUpperCase()
        : contextPostcode
            ? contextPostcode.replace(/\s+/g, '').toUpperCase()
            : null;
    const cleanedStreet = cleanAddressQuery(effectiveStreet);
    const baseAddr = [cleanedStreet, location.huisnummer].filter(Boolean).join(' ');

    // Build prioritized (query, postcodeFilter, cityFilter) tuples
    // Order: most specific first (postcode > city > bare query)
    const queryPlan = []; // each entry: { q, postcode, city }

    // 1. Exact match: street + number + postcode (postcode as PDOK filter)
    if (baseAddr && effectivePostcode) {
        queryPlan.push({ q: baseAddr, postcode: effectivePostcode, city: null });
    }

    // 2. Street + number + city (city as PDOK filter)
    if (baseAddr && location.woonplaats) {
        queryPlan.push({ q: baseAddr, postcode: null, city: location.woonplaats });
    }

    // 3. Street + number embedded in query with postcode string
    if (baseAddr && effectivePostcode) {
        queryPlan.push({ q: `${baseAddr} ${effectivePostcode}`, postcode: null, city: null });
    }

    // 4. Street + primaryCity
    if (baseAddr && primaryCity && primaryCity !== location.woonplaats) {
        queryPlan.push({ q: baseAddr, postcode: null, city: primaryCity });
    }

    // 5. Street + each dataset postcode as filter (broadest area context)
    if (baseAddr && datasetPostcodes.length > 0) {
        for (const pc of datasetPostcodes.slice(0, 3)) { // top 3 postcodes max
            if (pc !== effectivePostcode) {
                queryPlan.push({ q: baseAddr, postcode: pc, city: null });
            }
        }
    }

    // 6. Street alone (no filter)
    if (baseAddr) {
        queryPlan.push({ q: baseAddr, postcode: null, city: null });
    }

    // 7. Locatienaam + city/postcode context
    if (location.locatienaam) {
        const cleanedName = cleanAddressQuery(location.locatienaam);
        if (cleanedName && cleanedName !== cleanedStreet) {
            if (effectivePostcode) queryPlan.push({ q: cleanedName, postcode: effectivePostcode, city: null });
            if (location.woonplaats) queryPlan.push({ q: cleanedName, postcode: null, city: location.woonplaats });
            queryPlan.push({ q: cleanedName, postcode: null, city: null });
        }
    }

    // 8. Locatiecode as last resort
    if (location.locatiecode && location.locatiecode !== 'ONBEKEND') {
        queryPlan.push({ q: location.locatiecode, postcode: null, city: null });
    }

    // De-duplicate by q+postcode+city key
    const seen = new Set();
    const uniquePlan = queryPlan.filter(({ q, postcode, city }) => {
        const key = `${q}|${postcode}|${city}`;
        if (seen.has(key) || !q.trim()) return false;
        seen.add(key);
        return true;
    });

    let results = [];
    if (uniquePlan.length > 0) {
        const first = uniquePlan[0];
        console.log(`🔍 [Geocode] Targeting: "${first.q}" [pc:${first.postcode || '-'}, city:${first.city || '-'}] (${uniquePlan.length - 1} fallbacks)`);
    }

    // Request more results when we have a centroid so pickClosestResult has options to compare
    const numRows = projectCentroid ? 10 : 5;

    for (const { q, postcode, city } of uniquePlan) {
        results = await pdokSearch(q, city, postcode, numRows);
        if (results.length > 0) {
            console.log(`✅ [Geocode] Success for "${q}" [pc:${postcode || '-'}, city:${city || '-'}]: ${results.length} results.`);
            break;
        }
    }

    // Final fuzzy fallback on cleaned locatienaam
    if (results.length === 0 && location.locatienaam) {
        const fuzzyQuery = cleanAddressQuery(location.locatienaam);
        console.log(`⚠️ [Geocode] Trying fuzzy name fallback: "${fuzzyQuery}"`);
        results = await pdokSearch(fuzzyQuery, null, null, numRows);
    }

    if (results.length > 0) {
        // Pick the result geographically closest to the known project area
        const best = pickClosestResult(results, projectCentroid);
        enriched._enriched.pdok = best;

        // Save original values for traceability
        enriched._enriched._original = {
            straatnaam: location.straatnaam || '',
            huisnummer: location.huisnummer || '',
            postcode: location.postcode || '',
            woonplaats: location.woonplaats || '',
        };

        // Backfill ALL address fields from PDOK (overwrite incomplete data)
        if (best.straatnaam) enriched.straatnaam = best.straatnaam;
        if (best.huisnummer) enriched.huisnummer = String(best.huisnummer);
        if (best.postcode) enriched.postcode = best.postcode;
        if (best.woonplaats) enriched.woonplaats = best.woonplaats;

        enriched._enriched.gemeente = best.gemeente;
        enriched._enriched.provincie = best.provincie;
        enriched._enriched.woonplaats = best.woonplaats;

        console.log(`📍 [Address] Resolved: ${enriched.straatnaam} ${enriched.huisnummer}, ${enriched.postcode} ${enriched.woonplaats} (${best.gemeente}, ${best.provincie})`);

        // Parse coordinates
        const rdCoords = parseRdCoords(best.centroide_rd);
        const llCoords = parseLlCoords(best.centroide_ll);

        if (rdCoords) {
            const rdX = rdCoords.x;
            const rdY = rdCoords.y;
            enriched._enriched.rd = { x: rdX, y: rdY };

            // Set lat/lon directly for map rendering
            if (llCoords) {
                enriched._enriched.lat = llCoords.lat;
                enriched._enriched.lon = llCoords.lng;
            } else {
                const wgs = rdToWgs84(rdX, rdY);
                enriched._enriched.lat = wgs.lat;
                enriched._enriched.lon = wgs.lng;
            }
            console.log(`📍 [Geocode] Coords for "${best.weergavenaam}": RD(${Math.round(rdX)}, ${Math.round(rdY)}) WGS84(${enriched._enriched.lat?.toFixed(5)}, ${enriched._enriched.lon?.toFixed(5)})`);

            // Generate links
            enriched._enriched.topotijdreis = getHistorischeKaartLinks(rdX, rdY);
            enriched._enriched.topotijdreisHuidig = getTopotijdreisUrl(rdX, rdY);
            enriched._enriched.bodemloket = getBodemloketUrl(rdX, rdY);

            // Deep research: BAG, HBB, Bodemkwaliteitskaart
            console.log('📡 [Enrich] Starting deep research (BAG, HBB, BKK)...');
            const [bodemkwaliteit, buildings, hbb] = await Promise.all([
                getBodemkwaliteit(rdX, rdY, 50),
                getBuildingDetails(rdX, rdY, 30),
                getHbbData(rdX, rdY, 25),
            ]);
            if (bodemkwaliteit) enriched._enriched.bodemkwaliteit = bodemkwaliteit;
            if (buildings) enriched._enriched.buildings = buildings;
            if (hbb) enriched._enriched.hbb = hbb;
            console.log('✨ [Enrich] Deep research complete.');
        } else {
            console.error('❌ [Geocode] No valid RD coordinates in PDOK result:', best.centroide_rd);
        }
    } else {
        console.warn(`❌ [Geocode] Total failure for "${location.locatiecode || location.locatienaam}": No results for any of ${uniquePlan.length} queries.`);
    }

    // Final assessment mapping (placeholder for smartFill logic)
    // We store the status in the enriched object for easy access
    enriched._enriched.lastInvestigated = new Date().toISOString();

    return enriched;
}

/**
 * Enrich all locations (with rate limiting to avoid API abuse)
 * overrideCity: city detected from the project title/filename
 * documentPostcodes: postcodes extracted from the raw document text (PDF/DOCX full text)
 */
export async function enrichAllLocations(locations, onProgress, overrideCity = null, documentPostcodes = []) {
    // ── Context: collect postcodes, streets, cities from the dataset ──────────
    const streetContext = {};
    const cityCounts = {};
    const allDatasetPostcodes = new Set(documentPostcodes.map(p => p.replace(/\s+/g, '').toUpperCase()));

    for (const loc of locations) {
        if (loc.straatnaam && loc.postcode) {
            const street = loc.straatnaam.toLowerCase().trim();
            if (!streetContext[street]) streetContext[street] = new Set();
            const pc = loc.postcode.replace(/\s+/g, '').toUpperCase();
            streetContext[street].add(pc);
            allDatasetPostcodes.add(pc);
        } else if (loc.postcode) {
            allDatasetPostcodes.add(loc.postcode.replace(/\s+/g, '').toUpperCase());
        }
        if (loc.woonplaats) {
            const city = loc.woonplaats.trim();
            cityCounts[city] = (cityCounts[city] || 0) + 1;
        }
    }

    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
    const datasetPostcodesList = [...allDatasetPostcodes];

    if (topCities.length > 0) console.log(`🏙️ [Context] Top Cities: ${topCities.join(', ')}`);
    if (datasetPostcodesList.length > 0) {
        console.log(`📮 [Context] Postcodes (${datasetPostcodesList.length}): ${datasetPostcodesList.slice(0, 8).join(', ')}${datasetPostcodesList.length > 8 ? '...' : ''}`);
    }

    // ── Phase 1: Build project centroid from locations with known postcodes ───
    // TOB reports are always local — use reliable anchors to find the project area,
    // then pick the closest PDOK result for every other location.
    let projectCentroid = null;
    const anchorLocations = locations.filter(l => l.postcode && l.straatnaam);

    if (anchorLocations.length > 0) {
        console.log(`🧭 [Phase1] Quick-geocoding ${anchorLocations.length} postcode-location(s) to build centroid...`);
        const anchorPoints = [];
        for (const loc of anchorLocations) {
            const pt = await quickGeocode(loc);
            if (pt) anchorPoints.push(pt);
            await new Promise(r => setTimeout(r, 150));
        }
        if (anchorPoints.length > 0) {
            projectCentroid = {
                x: anchorPoints.reduce((s, p) => s + p.x, 0) / anchorPoints.length,
                y: anchorPoints.reduce((s, p) => s + p.y, 0) / anchorPoints.length,
            };
            console.log(`🎯 [Phase1] Project centroid: RD(${Math.round(projectCentroid.x)}, ${Math.round(projectCentroid.y)}) — all locations will be anchored to this area.`);
        }
    }

    // ── Phase 2: Full enrichment of all locations, guided by the centroid ─────
    const enriched = [];
    for (let i = 0; i < locations.length; i++) {
        if (onProgress) onProgress(i + 1, locations.length);

        const loc = locations[i];
        let contextPostcode = null;

        if (loc.straatnaam && !loc.postcode) {
            const street = loc.straatnaam.toLowerCase().trim();
            if (streetContext[street]) {
                contextPostcode = Array.from(streetContext[street])[0];
                console.log(`📍 [Context] Sharing postcode ${contextPostcode} with street ${loc.straatnaam}`);
            }
        }

        const primaryCity = overrideCity || topCities[0] || null;
        const enrichedLoc = await enrichLocation(loc, contextPostcode, primaryCity, datasetPostcodesList, projectCentroid);
        enriched.push(enrichedLoc);

        // Update centroid adaptively as more locations are resolved
        if (enrichedLoc._enriched?.rd?.x && enrichedLoc._enriched?.rd?.y && !projectCentroid) {
            projectCentroid = { x: enrichedLoc._enriched.rd.x, y: enrichedLoc._enriched.rd.y };
            console.log(`🎯 [Centroid] Initial centroid from first resolved location: RD(${Math.round(projectCentroid.x)}, ${Math.round(projectCentroid.y)})`);
        }

        if (i < locations.length - 1) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    return enriched;
}

// ══════════════════════════════════════
// GitHub Actions Integration
// ══════════════════════════════════════

/**
 * Triggers a GitHub Actions workflow for deep scanning
 */
export async function triggerDeepScan(locatiecode, query, githubToken, repoOwner, repoName) {
    if (!githubToken || !repoOwner || !repoName) {
        throw new Error('GitHub configuratie ontbreekt (token, owner of repo)');
    }

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/deep_scan.yml/dispatches`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ref: 'main',
            inputs: {
                locatiecode: locatiecode,
                query: query
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`GitHub trigger mislukt: ${errData.message || response.statusText}`);
    }

    return { success: true, message: 'Deep Scan gestart in GitHub Actions.' };
}

/**
 * Triggers a GitHub Actions workflow for a batch of locations
 */
export async function triggerDeepScanBatch(locations, githubToken, repoOwner, repoName) {
    if (!githubToken || !repoOwner || !repoName) {
        throw new Error('GitHub configuratie ontbreekt');
    }

    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/deep_scan.yml/dispatches`;

    // Process locations into simpler objects
    const simplified = locations.map(l => ({
        locatiecode: l.locatiecode,
        query: `${l.straatnaam} ${l.huisnummer} ${l.postcode}`
    }));

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            ref: 'main',
            inputs: {
                locations_json: JSON.stringify(simplified)
            }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(`GitHub batch trigger mislukt: ${errData.message || response.statusText}`);
    }

    return { success: true, message: `Deep Scan gestart voor ${locations.length} locaties.` };
}
