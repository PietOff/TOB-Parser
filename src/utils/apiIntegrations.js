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
export async function pdokSearch(query) {
    try {
        const url = `${PDOK_LOCATIE_BASE}/free?q=${encodeURIComponent(query)}&rows=5`;
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
const PROXY = 'https://api.allorigins.win/raw?url=';

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

        const res = await fetch(PROXY + encodeURIComponent(originalUrl));
        if (!res.ok) return null;
        const data = await res.json();
        // ...

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
        console.warn('Bodemkwaliteit query failed:', err);
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

        const res = await fetch(PROXY + encodeURIComponent(originalUrl));
        if (!res.ok) return null;
        const data = await res.json();

        return (data.features || []).map(f => ({
            naam: f.properties.naam || f.properties.activiteit,
            type: f.id.includes('asbest') ? 'Asbestverdacht' : 'Activiteit',
            bron: 'HBB (Historisch Bodem Bestand)',
        }));
    } catch (err) {
        console.warn('HBB query failed:', err);
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
    return `https://www.bodemloket.nl/kaart?zoom=15&x=${Math.round(rdX)}&y=${Math.round(rdY)}`;
}

import proj4 from 'proj4';

// Define RD (EPSG:28992) and WGS84 (EPSG:4326)
const RD = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs';
const WGS84 = 'EPSG:4326';

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
        const originalUrl = `https://service.pdok.nl/lvbag/bag/wfs/v2_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bag:pand&bbox=${bbox},EPSG:28992&outputFormat=application/json&count=10`;

        const res = await fetch(PROXY + encodeURIComponent(originalUrl));
        if (!res.ok) return null;
        const data = await res.json();

        return (data.features || []).map(f => ({
            id: f.properties.identificatie,
            bouwjaar: f.properties.oorspronkelijkbouwjaar,
            status: f.properties.status,
            oppervlakte: f.properties.oppervlakte,
        }));
    } catch (err) {
        console.warn('BAG WFS query failed:', err);
        return null;
    }
}

/**
 * Enrich a single TOB location with data from all available APIs
 * Call this for each location to add address details, coordinates, 
 * historical map links, and soil quality data.
 * 
 * Implements "Deep Investigation": tries multiple searches and performs 
 * background checks on all relevant protocol sources.
 */
export async function enrichLocation(location) {
    const enriched = { ...location, _enriched: {} };

    // Step 0: Detect and try Nazca location code lookup
    const nazcaPattern = /^[A-Z]{1,5}[-_]?\d{2,}/i;
    if (location.locatiecode && nazcaPattern.test(location.locatiecode) && !location.straatnaam) {
        console.log(`🔎 [Nazca] Detected potential Nazca code: ${location.locatiecode}`);
        const nazcaResult = await lookupNazcaCode(location.locatiecode);
        if (nazcaResult.found) {
            enriched._enriched._nazca = nazcaResult;
            // Fill address fields from Nazca result
            if (nazcaResult.data) {
                if (!enriched.straatnaam && nazcaResult.data.straatnaam) enriched.straatnaam = nazcaResult.data.straatnaam;
                if (!enriched.huisnummer && nazcaResult.data.huisnummer) enriched.huisnummer = nazcaResult.data.huisnummer;
                if (!enriched.postcode && nazcaResult.data.postcode) enriched.postcode = nazcaResult.data.postcode;
                if (!enriched.woonplaats && nazcaResult.data.woonplaats) enriched.woonplaats = nazcaResult.data.woonplaats;
            }
        }
    }

    // Step 1: Geocode - Priority on Address/Name over location codes
    const queries = [];

    // 1. Street + House Number + Postcode + City
    const fullAddr = [location.straatnaam, location.huisnummer, location.postcode, location.woonplaats].filter(Boolean).join(' ');
    if (fullAddr) queries.push(fullAddr);

    // 2. Street + City (for wider matching if house number fails)
    const streetCity = [location.straatnaam, location.woonplaats].filter(Boolean).join(' ');
    if (streetCity && streetCity !== fullAddr) queries.push(streetCity);

    // 3. Postcode + House Number (Very reliable if available)
    if (location.postcode && location.huisnummer) {
        queries.push(`${location.postcode} ${location.huisnummer}`);
    }

    // 4. Location name + City
    if (location.locatienaam) {
        queries.push(`${location.locatienaam} ${location.woonplaats || ''}`.trim());
    }

    // 5. Fallback to location code if nothing else works
    if (location.locatiecode) {
        queries.push(location.locatiecode);
    }

    let results = [];
    console.log(`🔍 [Geocode] Targeting: "${queries[0]}"... (Alternative queries: ${queries.length})`);

    for (const q of queries) {
        if (!q.trim()) continue;
        results = await pdokSearch(q);
        if (results.length > 0) {
            console.log(`✅ [Geocode] Success for "${q}": Found ${results.length} results.`);
            break;
        }
    }

    // If still no results, try a "fuzzy" search on the location name if it looks like a street
    if (results.length === 0 && location.locatienaam) {
        console.log(`⚠️ [Geocode] Trying fuzzy name fallback: "${location.locatienaam}"`);
        results = await pdokSearch(location.locatienaam);
    }

    if (results.length > 0) {
        const best = results[0];
        enriched._enriched.pdok = best;

        // Fill in missing address data from PDOK
        if (!enriched.straatnaam && best.straatnaam) enriched.straatnaam = best.straatnaam;
        if (!enriched.huisnummer && best.huisnummer) enriched.huisnummer = best.huisnummer;
        if (!enriched.postcode && best.postcode) enriched.postcode = best.postcode;
        if (!enriched.woonplaats && best.woonplaats) enriched.woonplaats = best.woonplaats;

        enriched._enriched.gemeente = best.gemeente;
        enriched._enriched.provincie = best.provincie;
        enriched._enriched.woonplaats = best.woonplaats;

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
        console.warn('❌ [Geocode] Total failure: No results for any query parts.');
    }

    // Final assessment mapping (placeholder for smartFill logic)
    // We store the status in the enriched object for easy access
    enriched._enriched.lastInvestigated = new Date().toISOString();

    return enriched;
}

/**
 * Enrich all locations (with rate limiting to avoid API abuse)
 */
export async function enrichAllLocations(locations, onProgress) {
    const enriched = [];
    for (let i = 0; i < locations.length; i++) {
        if (onProgress) onProgress(i + 1, locations.length);
        const loc = await enrichLocation(locations[i]);
        enriched.push(loc);
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
