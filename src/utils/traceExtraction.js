/**
 * Shared trace and address extraction utilities for TOB parsers
 */

// Dutch street-name suffix keywords
const STREET_SUFFIX_RE = /(?:straat|laan|weg|plein|singel|gracht|kade|dijk|dreef|steeg|pad|hof|ring|baan|allee|boulevard|markt|park)\b/i;

// Dutch postcode: 4 digits + 2 uppercase letters, optionally separated by a space
// Invalid letter combinations (reserved/military/postal codes) excluded
const POSTCODE_RE = /\b([1-9]\d{3})\s?([A-Z]{2})\b/g;
const INVALID_PC_LETTERS = new Set(['SA', 'SD', 'SS']);

/**
 * Extract all Dutch postcodes from a text blob.
 * Returns normalised strings like "1234AB" (no space).
 */
export function extractAllPostcodes(text) {
    if (!text) return [];
    const found = new Set();
    POSTCODE_RE.lastIndex = 0;
    let m;
    while ((m = POSTCODE_RE.exec(text)) !== null) {
        const letters = m[2].toUpperCase();
        if (!INVALID_PC_LETTERS.has(letters)) {
            found.add(m[1] + letters);
        }
    }
    return [...found];
}

/**
 * Normalise a postcode to "1234AB" (digits immediately followed by letters, uppercase).
 */
export function normalisePostcode(pc) {
    if (!pc) return '';
    return pc.replace(/\s+/g, '').toUpperCase();
}

/**
 * Extract all addresses found in the document.
 *
 * Strategy (two passes):
 *  Pass 1 – Postcode-anchored: find "StreetName HouseNum, Postcode City"
 *           These are the most reliable because the postcode anchors the match.
 *  Pass 2 – Street-suffix anchored: "StreetName HouseNum" without postcode.
 *           Only used when pass-1 gives nothing.
 */
export function extractAllAddresses(text) {
    if (!text) return [];
    const addresses = [];
    const seen = new Set();

    // ── Pass 1: postcode-anchored addresses ──────────────────────────────────
    // Matches: "[Street Name] [HouseNum] [,]? [Postcode] [City]"
    // Street name: one or more capitalised words (min 3 chars) optionally joined by spaces/hyphens
    // House number: digits optionally followed by a letter/suffix (e.g. 23, 23A, 23-25)
    // Postcode: 1234 AB or 1234AB
    // City: one or more capitalised words
    const anchored = /([A-Z][A-Za-zàáäâèéëêìíïîòóöôùúüûñ][A-Za-zàáäâèéëêìíïîòóöôùúüûñ\s\-\.]*?)\s+(\d{1,5}[A-Za-z]?(?:-\d{1,5}[A-Za-z]?)?)[\s,]+([1-9]\d{3})\s?([A-Z]{2})\b\s*([A-Z][A-Za-zàáäâèéëêìíïîòóöôùúüûñ\s\-]*)?/g;

    let m;
    anchored.lastIndex = 0;
    while ((m = anchored.exec(text)) !== null) {
        const straatnaam = m[1].trim().replace(/\s{2,}/g, ' ');
        const huisnummer = m[2].trim();
        const postcode = m[3] + m[4].toUpperCase();
        const city = (m[5] || '').trim().split(/\s{2,}/)[0]; // stop at double-space

        if (INVALID_PC_LETTERS.has(m[4])) continue;
        if (straatnaam.length < 3) continue;

        const key = `${straatnaam.toLowerCase()}|${huisnummer}`;
        if (seen.has(key)) continue;
        seen.add(key);

        addresses.push({ straatnaam, huisnummer, postcode, city, hasPostcode: true });
    }

    // ── Pass 2: street-suffix anchored (no postcode) ─────────────────────────
    // Only run if we need more results
    const suffixed = /([A-Z][A-Za-zàáäâèéëêìíïîòóöôùúüûñ\s\-\.]*?(?:straat|laan|weg|plein|singel|gracht|kade|dijk|dreef|steeg|pad|hof|ring|baan|allee|boulevard|markt|park))\s+(\d{1,5}[A-Za-z]?(?:-\d{1,5})?)/gi;

    suffixed.lastIndex = 0;
    while ((m = suffixed.exec(text)) !== null) {
        const straatnaam = m[1].trim().replace(/\s{2,}/g, ' ');
        const huisnummer = m[2].trim();

        if (straatnaam.length < 5) continue;

        const key = `${straatnaam.toLowerCase()}|${huisnummer}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Try to find a city name immediately after this address (within 60 chars)
        const afterAddr = text.slice(m.index + m[0].length, m.index + m[0].length + 80);
        const cityM = afterAddr.match(/^\s*,?\s*([A-Z][A-Za-zàáäâèéëêìíïîòóöôùúüûñ\s\-]{2,30}?)(?:[.,\n]|$)/);
        const city = cityM ? cityM[1].trim() : '';

        // Try to find a postcode nearby (before or after)
        const window = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 80);
        const pcM = /([1-9]\d{3})\s?([A-Z]{2})\b/.exec(window);
        const postcode = pcM && !INVALID_PC_LETTERS.has(pcM[2]) ? pcM[1] + pcM[2] : '';

        addresses.push({ straatnaam, huisnummer, postcode, city, hasPostcode: !!postcode });
    }

    console.log(`🔍 [AddressExtraction] Found ${addresses.length} addresses:`, addresses);
    return addresses;
}

/**
 * Select the best address from a list.
 * Priority: has postcode > mentioned in title > has street suffix > first found
 */
export function extractBestAddress(addresses, titleContext = '') {
    if (!addresses || addresses.length === 0) return null;

    // Priority 1: has postcode
    const withPostcode = addresses.filter(a => a.hasPostcode);
    if (withPostcode.length > 0) {
        // Among those with postcodes, prefer the one mentioned in title if possible
        if (titleContext) {
            const titleMatch = withPostcode.find(a =>
                titleContext.toLowerCase().includes(a.straatnaam.toLowerCase())
            );
            if (titleMatch) return titleMatch;
        }
        return withPostcode[0];
    }

    // Priority 2: mentioned in title
    if (titleContext) {
        const titleMatch = addresses.find(a =>
            titleContext.toLowerCase().includes(a.straatnaam.toLowerCase()) ||
            (a.city && titleContext.toLowerCase().includes(a.city.toLowerCase()))
        );
        if (titleMatch) return titleMatch;
    }

    // Priority 3: has a recognisable street suffix
    const withSuffix = addresses.find(a => STREET_SUFFIX_RE.test(a.straatnaam));
    if (withSuffix) return withSuffix;

    // Priority 4: first found
    return addresses[0];
}

/**
 * Extract trace description with distance patterns.
 * Looks for: "500m", "3 km", "van X naar Y"
 */
export function extractTraceDescription(text, projectCode = '') {
    const distance = { value: null, unit: 'm' };
    let description = '';

    // Pattern 1: explicit distance (e.g., "500m", "3.5 km")
    const distanceMatch = text.match(/(\d+[\.,]?\d*)\s*(?:km|kilo)?m(?:eter)?\b/i);
    if (distanceMatch) {
        const val = parseFloat(distanceMatch[1].replace(',', '.'));
        distance.value = val;
        distance.unit = distanceMatch[0].toLowerCase().includes('km') ? 'km' : 'm';
    }

    // Pattern 2: route description (e.g., "van Straat A naar Straat B")
    const routeMatch = text.match(/(?:van|from|route|tracé|leiding)\s+(.+?)\s+(?:naar|to|tot)\s+(.+?)(?:\.|,|$)/i);
    if (routeMatch) {
        description = `Van ${routeMatch[1]} naar ${routeMatch[2]}`;
    }

    // Pattern 3: fallback to omschrijving if available
    if (!description) {
        const omschrijvingMatch = text.match(/(?:omschrijving|description)[:\s]+([^.\n]+)/i);
        if (omschrijvingMatch) {
            description = omschrijvingMatch[1].trim();
        }
    }

    return {
        distance: distance.value,
        unit: distance.unit,
        description: description || `Project ${projectCode || 'locatie'}`,
    };
}
