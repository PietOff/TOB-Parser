/**
 * Shared trace and address extraction utilities for TOB parsers
 */

/**
 * Extract all addresses found in the document
 */
export function extractAllAddresses(text) {
    const addresses = [];
    // Pattern: "Straatnaam 123, 1234 AB City" or variations
    const addressPattern = /([A-Z][a-zàáäâèéëêìíïîòóöôùúüûñ\s\-\.]+?)(\d{1,3})\s*([a-zA-Z]*)?[,\s]+(\d{4}\s+[A-Z]{2})?[,\s]*([A-Z][a-zàáäâèéëêìíïîòóöôùúüûñ\s\-\.]+)?/g;
    let match;
    while ((match = addressPattern.exec(text)) !== null) {
        addresses.push({
            straatnaam: match[1].trim(),
            huisnummer: match[2] + (match[3] ? match[3] : ''),
            postcode: match[4]?.trim() || '',
            city: match[5]?.trim() || '',
            hasPostcode: !!match[4],
        });
    }
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
