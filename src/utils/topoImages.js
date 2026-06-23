/**
 * Fetches historical map images from topotijdreis.nl (ArcGIS MapServer)
 * for a given Dutch address, for the three template years: ~1945, 1995, ~2025.
 *
 * Uses PDOK Locatieserver for geocoding (address → RD coordinates) and the
 * ArcGIS REST export endpoint for static map images.
 */

const ARCGIS_BASE =
    'https://tiles.arcgis.com/tiles/nSZVuSZjHpEZZbRo/arcgis/rest/services';

// Nearest available topotijdreis years to the three template columns
const YEARS = ['1943', '1995', '2021'];

/**
 * Geocode a Dutch address query to RD (EPSG:28992) coordinates via PDOK.
 * Returns { x, y } in meters.
 */
async function geocodeRD(query) {
    const url =
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free` +
        `?q=${encodeURIComponent(query)}&rows=1&fq=type:adres`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK geocoder: HTTP ${resp.status}`);
    const json = await resp.json();
    const doc = json?.response?.docs?.[0];
    if (!doc?.centroide_rd) throw new Error(`Adres niet gevonden: ${query}`);
    // centroide_rd is WKT "POINT(x y)"
    const [x, y] = doc.centroide_rd
        .replace('POINT(', '')
        .replace(')', '')
        .split(' ')
        .map(Number);
    return { x, y };
}

/**
 * Fetch a static PNG map image from the ArcGIS topotijdreis service.
 * @param {string} year  e.g. "1943"
 * @param {string} bbox  "xmin,ymin,xmax,ymax" in RD (EPSG:28992)
 * @returns {Blob}       PNG image blob
 */
async function fetchTopoImage(year, bbox) {
    const url =
        `${ARCGIS_BASE}/Historische_tijdreis_${year}/MapServer/export` +
        `?bbox=${bbox}&bboxSR=28992&size=400,400&imageSR=28992&format=png&f=image`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Topotijdreis ${year}: HTTP ${resp.status}`);
    return resp.blob();
}

/**
 * Main entry point.  Geocodes the address and fetches three map images.
 * @param {string} addressQuery  e.g. "Graafschappad 10 Son"
 * @param {number} [halfSizeM=300]  half-width of the map extent in metres
 * @returns {Promise<Blob[]>}  [blob1943, blob1995, blob2021]
 */
export async function fetchTopoImages(addressQuery, halfSizeM = 300) {
    const { x, y } = await geocodeRD(addressQuery);
    const bbox = `${x - halfSizeM},${y - halfSizeM},${x + halfSizeM},${y + halfSizeM}`;
    return Promise.all(YEARS.map(year => fetchTopoImage(year, bbox)));
}
