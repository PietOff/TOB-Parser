/**
 * Fetches historical map images from topotijdreis.nl (ArcGIS MapServer)
 * for a given Dutch address, for three years: 1943, 1995, 2021.
 *
 * These are tiled map services — the export endpoint does not exist.
 * We fetch individual tiles, stitch them on a canvas, and crop to the bbox.
 *
 * Tile grid parameters come from the service tileInfo (EPSG:28992 / RD New):
 *   origin (-30 515 500, 31 124 000), tile 256 px, 12 zoom levels (0–11).
 */

const ARCGIS_BASE =
    'https://tiles.arcgis.com/tiles/nSZVuSZjHpEZZbRo/arcgis/rest/services';

const YEARS = ['1943', '1995', '2021'];

const TILE_ORIGIN_X = -30515500;
const TILE_ORIGIN_Y =  31124000;
const TILE_PX       = 256;

// metres-per-pixel at each zoom level 0–11
const RESOLUTIONS = [
    3251.21, 1625.60, 812.80, 406.40, 203.20, 101.60,
      50.80,   25.40,  12.70,   6.35,   3.18,   1.59,
];

// Zoom level 10 (3.18 m/px) gives 1–2 tiles per axis for a typical 600 m extent
// while keeping source resolution high enough for a Word document image.
const ZOOM = 10;

async function geocodeRD(query) {
    const url =
        `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free` +
        `?q=${encodeURIComponent(query)}&rows=1&fq=type:adres`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK geocoder: HTTP ${resp.status}`);
    const json = await resp.json();
    const doc = json?.response?.docs?.[0];
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
 * Geocodes the address and fetches three map images (1943, 1995, 2021).
 * @param {string} addressQuery  e.g. "Graafschappad 10 Son"
 * @param {number} [halfSizeM=300]  half-width of the map extent in metres
 * @returns {Promise<Blob[]>}  [blob1943, blob1995, blob2021]
 */
export async function fetchTopoImages(addressQuery, halfSizeM = 300) {
    const { x, y } = await geocodeRD(addressQuery);
    return Promise.all(YEARS.map(year => fetchTopoImage(year, x, y, halfSizeM, 400)));
}
