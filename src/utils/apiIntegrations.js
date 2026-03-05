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
 */
export async function pdokSearch(query, cityContext = null) {
    try {
        let url = `${PDOK_LOCATIE_BASE}/free?q=${encodeURIComponent(query)}&rows=5`;
        if (cityContext) {
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

/**
 * Enrich a single TOB location with data from all available APIs
 * contextPostcode is an optional postcode shared from neighboring locations on the same street
 * primaryCity is the most frequent city in the dataset, used for strict geocoding fallback
 */
export async function enrichLocation(location, contextPostcode = null, primaryCity = null) {
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

    const effectivePostcode = location.postcode || contextPostcode;
    const cleanedStreet = cleanAddressQuery(effectiveStreet);
    const baseAddr = [cleanedStreet, location.huisnummer].filter(Boolean).join(' ');

    // Build prioritized query list
    const queries = [];

    // 1. Exact: street + postcode + city (highest precision)
    if (baseAddr && effectivePostcode) {
        // If we have a postcode, don't even add the city. Postcode is uniquely identifying 
        // and adding a contradictory city might confuse PDOK.
        queries.push(`${baseAddr} ${effectivePostcode}`);
    }

    // 2. Street + explicit location city (without postcode)
    if (baseAddr && location.woonplaats) {
        queries.push(`${baseAddr} ${location.woonplaats}`);
    }

    // 3. Street + primaryCity (fallback context detected from filename/title/dataset)
    if (baseAddr && !location.woonplaats && primaryCity) {
        queries.push(`${baseAddr} ${primaryCity}`);
    }

    // 4. Street alone (let PDOK guess based on uniqueness)
    if (baseAddr) {
        queries.push(baseAddr);
    }

    // 5. Locatienaam (cleaned) + explicit city context
    if (location.locatienaam) {
        const cleanedName = cleanAddressQuery(location.locatienaam);
        if (cleanedName && cleanedName !== cleanedStreet) {
            if (location.woonplaats) {
                queries.push(`${cleanedName} ${location.woonplaats}`);
            } else if (primaryCity) {
                queries.push(`${cleanedName} ${primaryCity}`);
            }
            queries.push(cleanedName);
        }
    }

    // 6. Locatiecode as last resort (often doesn't yield addresses but sometimes matches PDOK aliases)
    if (location.locatiecode && location.locatiecode !== 'ONBEKEND') {
        queries.push(location.locatiecode);
    }

    // De-duplicate queries
    const uniqueQueries = [...new Set(queries.filter(q => q.trim()))];

    let results = [];
    if (uniqueQueries.length > 0) {
        console.log(`🔍 [Geocode] Targeting: "${uniqueQueries[0]}"... (${uniqueQueries.length - 1} fallbacks)`);
    }

    // Try each query in order of priority. 
    // We remove the strict 'primaryCity' filter loop here, because we already integrated 
    // primaryCity into the fallback queries when appropriate (query level 3).
    // Forcing a city filter on PDOK often breaks perfectly good postcode matches.
    for (const q of uniqueQueries) {
        results = await pdokSearch(q, null);
        if (results.length > 0) {
            console.log(`✅ [Geocode] Success for "${q}": Found ${results.length} results.`);
            break;
        }
    }

    // Final fuzzy fallback on cleaned locatienaam
    if (results.length === 0 && location.locatienaam) {
        const fuzzyQuery = cleanAddressQuery(location.locatienaam);
        console.log(`⚠️ [Geocode] Trying fuzzy name fallback: "${fuzzyQuery}"`);
        results = await pdokSearch(fuzzyQuery, null);
    }

    if (results.length > 0) {
        const best = results[0];
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

        // Parse RD coordinates from centroid
        if (best.centroide_rd) {
            // Updated regex to handle optional space after POINT
            const rdMatch = best.centroide_rd.match(/POINT\s*\((\d+\.?\d*)\s+(\d+\.?\d*)\)/);
            if (rdMatch) {
                const rdX = parseFloat(rdMatch[1]);
                const rdY = parseFloat(rdMatch[2]);
                enriched._enriched.rd = { x: rdX, y: rdY };
                console.log(`📍 [Geocode] Resolved RD Coords for "${best.weergavenaam}": X=${rdX}, Y=${rdY}`);

                // Generate Topotijdreis links
                enriched._enriched.topotijdreis = getHistorischeKaartLinks(rdX, rdY);
                enriched._enriched.topotijdreisHuidig = getTopotijdreisUrl(rdX, rdY);

                // Generate Bodemloket link
                enriched._enriched.bodemloket = getBodemloketUrl(rdX, rdY);

                // ---------------------------------------------------------
                // DEEP SEARCH: Parallel background research (PDOK/BAG/HBB)
                // ---------------------------------------------------------
                console.log('📡 [Enrich] Starting deep research (BAG, HBB, BKK)...');
                const [bodemkwaliteit, buildings, hbb] = await Promise.all([
                    getBodemkwaliteit(rdX, rdY, 50),  // 50m buffer
                    getBuildingDetails(rdX, rdY, 30), // 30m buffer for nearby buildings
                    getHbbData(rdX, rdY, 25)        // 25m buffer (protocol standard)
                ]);

                if (bodemkwaliteit) enriched._enriched.bodemkwaliteit = bodemkwaliteit;
                if (buildings) enriched._enriched.buildings = buildings;
                if (hbb) enriched._enriched.hbb = hbb;
                console.log('✨ [Enrich] Deep research complete.');
            } else {
                console.error('❌ [Geocode] Failed to parse RD coordinates from centroid:', best.centroide_rd);
            }
        } else {
            console.error('❌ [Geocode] No centroide_rd found in PDOK result.');
        }
    } else {
        console.warn(`❌ [Geocode] Total failure for "${location.locatiecode || location.locatienaam}": No results for any of ${uniqueQueries.length} queries.`);
    }

    // Final assessment mapping (placeholder for smartFill logic)
    // We store the status in the enriched object for easy access
    enriched._enriched.lastInvestigated = new Date().toISOString();

    return enriched;
}

/**
 * Enrich all locations (with rate limiting to avoid API abuse)
 * overrideCity is a city detected from the project title/filename to force context
 */
export async function enrichAllLocations(locations, onProgress, overrideCity = null) {
    // Phase 1: Context building (Postcode & Regional City Proximity)
    const streetContext = {};
    const cityCounts = {};

    for (const loc of locations) {
        // Collect postcodes per street
        if (loc.straatnaam && loc.postcode) {
            const street = loc.straatnaam.toLowerCase().trim();
            if (!streetContext[street]) streetContext[street] = new Set();
            streetContext[street].add(loc.postcode.replace(/\s+/g, '').toUpperCase());
        }
        // Count city occurrences to map the project's region
        if (loc.woonplaats) {
            const city = loc.woonplaats.trim();
            cityCounts[city] = (cityCounts[city] || 0) + 1;
        }
    }

    const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
    if (topCities.length > 0) {
        console.log(`🏙️ [Context] Project Region Top Cities: ${topCities.join(', ')}`);
    }

    const enriched = [];
    for (let i = 0; i < locations.length; i++) {
        if (onProgress) onProgress(i + 1, locations.length);

        const loc = locations[i];
        let contextPostcode = null;

        if (loc.straatnaam && !loc.postcode) {
            const street = loc.straatnaam.toLowerCase().trim();
            if (streetContext[street]) {
                contextPostcode = Array.from(streetContext[street])[0];
                console.log(`📍 [Context] Applying postcode ${contextPostcode} to street ${loc.straatnaam}`);
            }
        }

        // Use overrideCity (from title/filename) or fall back to statistical majority (topCities[0])
        const primaryCity = overrideCity || topCities[0] || null;

        const enrichedLoc = await enrichLocation(loc, contextPostcode, primaryCity);
        enriched.push(enrichedLoc);

        // Rate limit: 200ms between requests
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
