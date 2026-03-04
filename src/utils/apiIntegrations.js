/**
 * External API integrations for enriching TOB data
 * 
 * All APIs used are free, open Dutch government services:
 * - PDOK Locatieserver: geocoding, address search, coordinates
 * - BAG API: building/address details (bouwjaar, oppervlakte, gebruiksdoel)
 * - Topotijdreis: historical map links for visual reference
 * - Bodemloket: soil data links
 */

const PDOK_LOCATIE_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';
const BAG_API_BASE = 'https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2';
const TOPOTIJDREIS_BASE = 'https://www.topotijdreis.nl';

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

/**
 * Get bodemkwaliteitskaart data for a given location (RD coordinates)
 * Uses PDOK WFS service for bodemkwaliteitskaart
 */
export async function getBodemkwaliteit(rdX, rdY, buffer = 50) {
    try {
        const bbox = `${rdX - buffer},${rdY - buffer},${rdX + buffer},${rdY + buffer}`;
        const url = `https://service.pdok.nl/provincies/bodemkwaliteit/wfs/v1_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bodemkwaliteit:bodemkwaliteitskaart&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=5`;

        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();

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
        const url = `https://service.pdok.nl/provincies/bodemkwaliteit/wfs/v1_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bodemkwaliteit:hbb_activiteit,bodemkwaliteit:hbb_asbestverdacht&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=10`;

        const res = await fetch(url);
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

// ══════════════════════════════════════
// WGS84 ↔ RD coordinate conversion
// ══════════════════════════════════════

/**
 * Convert WGS84 (lat/lng) to RD (Rijksdriehoek) coordinates
 * Simplified approximation (accuracy ~1m for Netherlands)
 */
export function wgs84ToRd(lat, lng) {
    const dLat = 0.36 * (lat - 52.15517440);
    const dLng = 0.36 * (lng - 5.38720621);

    const x = 155000
        + 190094.945 * dLng
        - 11832.228 * dLat * dLng
        - 114.221 * dLat * dLat * dLng
        + 0.3 * dLng * dLng * dLng;

    const y = 463000
        + 309056.544 * dLat
        - 0.0 * dLng
        - 32.509 * dLng * dLng
        - 0.0 * dLat * dLat
        - 0.019 * dLng * dLng * dLng * dLng;

    return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Convert RD to WGS84 (lat/lng)
 */
export function rdToWgs84(x, y) {
    const dX = (x - 155000) / 100000;
    const dY = (y - 463000) / 100000;

    const lat = 52.15517440
        + dY * 3235.65389
        + dX * dX * -32.58297
        + dY * dY * -0.2475
        + dX * dX * dY * -0.84978
        + dX * dX * dY * dY * -0.0655
        + dY * dY * dY * 0.01709
        + dX * dX * dX * dX * -0.00738;

    const lng = 5.38720621
        + dX * 5260.52916
        + dX * dY * 105.94684
        + dX * dY * dY * 2.45656
        + dX * dX * dX * -0.81885
        + dX * dY * dY * dY * 0.05594
        + dX * dX * dX * dY * -0.05607
        + dY * 0.01199;

    return {
        lat: lat / 3600 + 52.15517440,
        lng: lng / 3600 + 5.38720621,
    };
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
        const url = `https://service.pdok.nl/lvbag/bag/wfs/v2_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bag:pand&bbox=${bbox},EPSG:28992&outputFormat=application/json&count=10`;

        const res = await fetch(url);
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
 * Implements "Automated Discovery": tries multiple searches if initial fails.
 */
export async function enrichLocation(location) {
    const enriched = { ...location, _enriched: {} };

    // Step 1: Geocode - Priority on Address/Name over location codes (Nazca codes are less specific for mapping)
    const queries = [];

    // 1. Street + House Number + Postcode + City
    const fullAddr = [location.straatnaam, location.huisnummer, location.postcode, location.woonplaats].filter(Boolean).join(' ');
    if (fullAddr) queries.push(fullAddr);

    // 2. Street + City (for wider matching)
    const streetCity = [location.straatnaam, location.woonplaats].filter(Boolean).join(' ');
    if (streetCity && streetCity !== fullAddr) queries.push(streetCity);

    // 3. Location name + City
    if (location.locatienaam) {
        queries.push(`${location.locatienaam} ${location.woonplaats || ''}`.trim());
    }

    // 4. Fallback to location code if nothing else works
    if (location.locatiecode) {
        queries.push(location.locatiecode);
    }

    let results = [];
    for (const q of queries) {
        if (!q.trim()) continue;
        results = await pdokSearch(q);
        if (results.length > 0) break;
    }

    if (results.length > 0) {
        const best = results[0];
        enriched._enriched.pdok = best;

        // Fill in missing address data
        if (!enriched.straatnaam && best.straatnaam) enriched.straatnaam = best.straatnaam;
        if (!enriched.huisnummer && best.huisnummer) enriched.huisnummer = best.huisnummer;
        if (!enriched.postcode && best.postcode) enriched.postcode = best.postcode;
        enriched._enriched.gemeente = best.gemeente;
        enriched._enriched.provincie = best.provincie;
        enriched._enriched.woonplaats = best.woonplaats;

        // Parse RD coordinates from centroid
        if (best.centroide_rd) {
            const rdMatch = best.centroide_rd.match(/POINT\((\d+\.?\d*)\s+(\d+\.?\d*)\)/);
            if (rdMatch) {
                const rdX = parseFloat(rdMatch[1]);
                const rdY = parseFloat(rdMatch[2]);
                enriched._enriched.rd = { x: rdX, y: rdY };

                // Generate Topotijdreis links
                enriched._enriched.topotijdreis = getHistorischeKaartLinks(rdX, rdY);
                enriched._enriched.topotijdreisHuidig = getTopotijdreisUrl(rdX, rdY);

                // Generate Bodemloket link
                enriched._enriched.bodemloket = getBodemloketUrl(rdX, rdY);

                // Get bodemkwaliteitskaart data
                const bodemkwaliteit = await getBodemkwaliteit(rdX, rdY);
                if (bodemkwaliteit) {
                    enriched._enriched.bodemkwaliteit = bodemkwaliteit;
                }

                // NEW: Get nearby buildings and their years (BAG)
                const buildings = await getBuildingDetails(rdX, rdY, 25); // 25m radius
                if (buildings) {
                    enriched._enriched.buildings = buildings;
                }

                // NEW: Get HBB data (activities & asbestos suspect locations)
                const hbb = await getHbbData(rdX, rdY, 25);
                if (hbb) {
                    enriched._enriched.hbb = hbb;
                }
            }
        }
    }

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
