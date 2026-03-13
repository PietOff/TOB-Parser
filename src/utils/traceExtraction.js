/**
 * Shared trace and address extraction utilities for TOB parsers
 */

/**
 * Extract all addresses found in the document
 */
// Words that look like street names but are section headers or document structure words
const NON_STREET_WORDS = /^(Deellocatie|Locatiecode|Locatienaam|Bijlage|Pagina|Versie|Paragraaf|Hoofdstuk|Tabel|Figuur|Aanhangsel|Opmerking|Rapport|Datum|Inleiding|Conclusie|Samenvatting|Beschrijving|Straatnaam|Plaatsnaam|Woonplaats|Huisnummer|Postcode|Status|Beoordeling|Vervolgactie|Rapportinformatie|Activiteiten|Gebruik|Bodemonderzoek|Onderzoeksbureau|Rapportdatum|Bodeminformatie|Utrecht|Amsterdam|Rotterdam|Den\s+Haag|Schiedam|Delft|Leiden)$/i;

export function extractAllAddresses(text) {
    const addresses = [];
    // Pattern: more flexible - "Straatnaam 123, 1234 AB City" or just "Straatnaam 123"
    // Look for: Word(s) + number + optional postcode + optional city
    const addressPattern = /([A-Z][a-zàáäâèéëêìíïîòóöôùúüûñ\s\-\.]+?)\s+(\d{1,3}[A-Za-z]*)\s+([0-9]{4}\s+[A-Z]{2})?([A-Z][a-z\s\-àáäâèéëêìíïîòóöôùúüûñ]*)?/g;
    let match;
    const seen = new Set();

    while ((match = addressPattern.exec(text)) !== null) {
        const straatnaam = match[1].trim();
        const huisnummer = match[2].trim();
        const postcode = match[3]?.trim() || '';
        const city = match[4]?.trim() || '';

        // Filter out section headers and document structure words that match the address pattern
        if (NON_STREET_WORDS.test(straatnaam)) continue;
        // Also filter out very short "street names" (1-2 chars) and pure numbers
        if (straatnaam.length < 4 || /^\d+$/.test(straatnaam)) continue;
        // Filter out house numbers that are too large to be real (>9999)
        if (parseInt(huisnummer) > 9999) continue;

        // Avoid duplicates
        const key = `${straatnaam}|${huisnummer}`;
        if (seen.has(key)) continue;
        seen.add(key);

        addresses.push({
            straatnaam,
            huisnummer,
            postcode,
            city,
            hasPostcode: postcode.length > 0,
        });
    }

    console.log(`🔍 [AddressExtraction] Found ${addresses.length} addresses:`, addresses);
    return addresses;
}

/**
 * Select the best address from a list
 * Priority: has postcode > mentioned in title > first found
 */
export function extractBestAddress(addresses, titleContext = '') {
    if (!addresses || addresses.length === 0) return null;

    // Priority 1: has postcode
    const withPostcode = addresses.filter(a => a.hasPostcode);
    if (withPostcode.length > 0) {
        return withPostcode[0];
    }

    // Priority 2: mentioned in title or first significant context
    if (titleContext) {
        const titleMatch = addresses.find(a =>
            titleContext.toLowerCase().includes(a.straatnaam.toLowerCase()) ||
            titleContext.toLowerCase().includes(a.city.toLowerCase())
        );
        if (titleMatch) return titleMatch;
    }

    // Priority 3: first found
    return addresses[0];
}

/**
 * Extract trace description with distance patterns
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
        distance.unit = text[distanceMatch.index + distanceMatch[0].length - 1].toLowerCase() === 'm' &&
            distanceMatch[0].toLowerCase().includes('km') ? 'km' : 'm';
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
