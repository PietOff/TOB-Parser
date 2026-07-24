/**
 * Fetches historical map images from topotijdreis.nl (ArcGIS MapServer)
 * for a given Dutch address, for three years: 1945, 1995, 2025.
 *
 * These are tiled map services — the export endpoint does not exist.
 * We fetch individual tiles, stitch them on a canvas, and crop to the bbox.
 *
 * Tile grid parameters come from the service tileInfo (EPSG:28992 / RD New):
 *   origin (-30 515 500, 31 112 399.999999993), tile 256 px, 12 zoom levels (0–11).
 * These must match the server's tileInfo to full precision — origin and row/col
 * indices are on the order of 1e7-1e8, so even a rounded resolution (e.g. 3.18
 * instead of the true 3.1750063500127004) compounds into tens of kilometres of
 * drift by the time it's multiplied across ~37,000 tile rows.
 */

const ARCGIS_BASE =
    'https://tiles.arcgis.com/tiles/nSZVuSZjHpEZZbRo/arcgis/rest/services';

const YEARS = ['1945', '1995', '2025'];

const TILE_ORIGIN_X = -30515500;
const TILE_ORIGIN_Y =  31112399.999999993;
const TILE_PX       = 256;

// metres-per-pixel at each zoom level 0–11 (exact values from MapServer tileInfo.lods)
const RESOLUTIONS = [
    3251.206502413005,  1625.6032512065026, 812.8016256032513,
     406.40081280162565, 203.20040640081282, 101.60020320040641,
      50.800101600203206, 25.400050800101603, 12.700025400050801,
       6.350012700025401,  3.1750063500127004, 1.5875031750063502,
];

// Use the finest zoom level the service offers (level 11, ~1.59 m/px) for the
// sharpest possible source imagery; a 600 m extent still only needs a handful
// of 256px tiles per axis at this resolution.
const ZOOM = RESOLUTIONS.length - 1;

async function geocodeRD(query, city) {
    const url =
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free` +
        `?q=${encodeURIComponent(query)}&rows=10&fq=type:adres`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK geocoder: HTTP ${resp.status}`);
    const json = await resp.json();
    const docs = json?.response?.docs || [];
    // PDOK's free-text search ranks purely on street+housenumber relevance and
    // largely ignores the city term, so the top hit is often in the wrong town
    // (e.g. a same-named street elsewhere). Prefer the candidate whose woonplaats
    // actually matches the given city.
    const cityLower = city?.trim().toLowerCase();
    const doc = (cityLower && docs.find(d => d.woonplaatsnaam?.toLowerCase() === cityLower))
        || docs[0];
    if (cityLower && doc && doc.woonplaatsnaam?.toLowerCase() !== cityLower) {
        console.warn(`Topotijdreis: geen adresmatch in "${city}", gebruik dichtstbijzijnde treffer: ${doc.weergavenaam}`);
    }
    if (!doc?.centroide_rd) throw new Error(`Adres niet gevonden: ${query}`);
    const [x, y] = doc.centroide_rd
        .replace('POINT(', '').replace(')', '').split(' ').map(Number);
    return { x, y };
}

async function loadTile(url) {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise(resolve => {
        const img = new Image();
        const objUrl = URL.createObjectURL(blob);
        img.onload  = () => { URL.revokeObjectURL(objUrl); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null); };
        img.src = objUrl;
    });
}

async function fetchTopoImage(year, centerX, centerY, halfSizeM, outputPx) {
    const res  = RESOLUTIONS[ZOOM];
    const xmin = centerX - halfSizeM;
    const xmax = centerX + halfSizeM;
    const ymin = centerY - halfSizeM;
    const ymax = centerY + halfSizeM;

    // Tile indices that intersect the bbox
    const colMin = Math.floor((xmin - TILE_ORIGIN_X) / (TILE_PX * res));
    const colMax = Math.floor((xmax - TILE_ORIGIN_X) / (TILE_PX * res));
    const rowMin = Math.floor((TILE_ORIGIN_Y - ymax) / (TILE_PX * res));
    const rowMax = Math.floor((TILE_ORIGIN_Y - ymin) / (TILE_PX * res));

    const numCols = colMax - colMin + 1;
    const numRows = rowMax - rowMin + 1;

    // Fetch all tiles in parallel
    const entries = [];
    for (let row = rowMin; row <= rowMax; row++) {
        for (let col = colMin; col <= colMax; col++) {
            const tileUrl =
                `${ARCGIS_BASE}/Historische_tijdreis_${year}/MapServer/tile/${ZOOM}/${row}/${col}`;
            entries.push({ r: row - rowMin, c: col - colMin, p: loadTile(tileUrl) });
        }
    }
    const tiles = await Promise.all(entries.map(async e => ({ ...e, img: await e.p })));

    // Stitch tiles onto a single canvas
    const stitch = document.createElement('canvas');
    stitch.width  = numCols * TILE_PX;
    stitch.height = numRows * TILE_PX;
    const sCtx = stitch.getContext('2d');
    for (const { r, c, img } of tiles) {
        if (img) sCtx.drawImage(img, c * TILE_PX, r * TILE_PX);
    }

    // Pixel offset of the exact bbox within the stitched canvas
    const srcX = (xmin - TILE_ORIGIN_X) / res - colMin * TILE_PX;
    const srcY = (TILE_ORIGIN_Y - ymax) / res - rowMin * TILE_PX;
    const srcW = (xmax - xmin) / res;
    const srcH = (ymax - ymin) / res;

    // Crop to bbox and scale to output size
    const out = document.createElement('canvas');
    out.width  = outputPx;
    out.height = outputPx;
    out.getContext('2d').drawImage(stitch, srcX, srcY, srcW, srcH, 0, 0, outputPx, outputPx);

    return new Promise(resolve => out.toBlob(resolve, 'image/png'));
}

/**
 * Geocodes the address and fetches three map images (1945, 1995, 2025).
 * @param {string} addressQuery  e.g. "Graafschappad 10 Son"
 * @param {string} [city]  plaatsnaam, used to disambiguate same-named streets in other towns
 * @param {number} [halfSizeM=50]  half-width of the map extent in metres (default: 100m x 100m)
 * @returns {Promise<Blob[]>}  [blob1945, blob1995, blob2025]
 */
export async function fetchTopoImages(addressQuery, city, halfSizeM = 50) {
    const { x, y } = await geocodeRD(addressQuery, city);
    return Promise.all(YEARS.map(year => fetchTopoImage(year, x, y, halfSizeM, 400)));
}
