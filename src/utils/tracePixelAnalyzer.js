/**
 * Trace Pixel Analyzer
 *
 * Detects the contamination-trace ellipse from Tauw TOB map images using
 * pure browser-side Canvas pixel analysis — no API calls, no OCR required.
 *
 * The Tauw TOB maps follow a consistent visual language:
 *   • Yellow pixels  = the measurement-point marker (horizontal bar) AND
 *                      the dashed ellipse contour (yellow+black alternating)
 *   • Scale bar      = bottom-right corner, alternating black/white segments
 *                      spanning "0 7 14 21 28 m" (28 m total)
 *
 * Detection pipeline:
 *  1. Find all yellow pixels → bounding box of yellow cloud = trace ellipse extent
 *  2. Detect scale bar in bottom-right quadrant → pixels per metre
 *  3. Return real-world ellipse dimensions
 */

// Default scale bar value for Tauw TOB template (can be overridden)
const DEFAULT_SCALE_BAR_M = 28;

// Yellow detection thresholds (RGB)
const Y_R_MIN = 150, Y_G_MIN = 120, Y_B_MAX = 100, Y_RB_DIFF = 80;

/**
 * Analyse a trace map image blob and return the ellipse dimensions in metres.
 *
 * @param {Blob} imageBlob  - The PNG blob extracted from the DOCX
 * @param {number} [scaleBarM=28]  - Expected scale bar span in metres
 * @returns {Promise<TraceShape|null>}
 *
 * @typedef {Object} TraceShape
 * @property {number} widthM        - East-west extent of trace in metres
 * @property {number} heightM       - North-south extent of trace in metres
 * @property {number} pxPerM        - Detected pixels per metre
 * @property {number} scaleBarPx    - Measured scale bar width in pixels
 * @property {number} scaleBarM     - Scale bar value used
 * @property {number} imageW        - Source image width in pixels
 * @property {number} imageH        - Source image height in pixels
 */
export async function analyzeTraceImage(imageBlob, scaleBarM = DEFAULT_SCALE_BAR_M) {
    const url = URL.createObjectURL(imageBlob);
    try {
        return await _analyze(url, scaleBarM);
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function _analyze(url, scaleBarM) {
    const img = await _loadImage(url);
    const { w, h, data } = _getPixels(img);

    // ── 1. Yellow pixel bounding box ────────────────────────────────────────
    let minX = w, maxX = 0, minY = h, maxY = 0;
    let yellowCount = 0;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > Y_R_MIN && g > Y_G_MIN && b < Y_B_MAX && r - b > Y_RB_DIFF) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                yellowCount++;
            }
        }
    }

    if (yellowCount < 20) {
        console.warn('[TraceAnalyzer] Too few yellow pixels, cannot detect trace');
        return null;
    }

    const ellipseWpx = maxX - minX;
    const ellipseHpx = maxY - minY;

    // ── 2. Scale bar detection (bottom-right quadrant) ──────────────────────
    const brX0 = Math.floor(w * 0.55);
    const brY0 = Math.floor(h * 0.80);
    let maxRunPx = 0;

    for (let y = brY0; y < h; y++) {
        let runLen = 0;
        for (let x = brX0; x < w; x++) {
            const i = (y * w + x) * 4;
            const isDark = data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50;
            if (isDark) {
                runLen++;
            } else {
                if (runLen > maxRunPx) maxRunPx = runLen;
                runLen = 0;
            }
        }
        if (runLen > maxRunPx) maxRunPx = runLen;
    }

    if (maxRunPx < 20) {
        console.warn('[TraceAnalyzer] Scale bar not detected, using fallback estimation');
        // Fallback: estimate scale from image width covering typical 60–80m map width
        maxRunPx = Math.round(w * 0.45); // rough: 28m ≈ 45% of image width
    }

    const pxPerM = maxRunPx / scaleBarM;
    const widthM = ellipseWpx / pxPerM;
    const heightM = ellipseHpx / pxPerM;

    console.log(
        `[TraceAnalyzer] scale=${pxPerM.toFixed(2)}px/m, ` +
        `ellipse=${ellipseWpx}×${ellipseHpx}px → ${widthM.toFixed(1)}×${heightM.toFixed(1)}m`
    );

    return { widthM, heightM, pxPerM, scaleBarPx: maxRunPx, scaleBarM, imageW: w, imageH: h };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function _loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

function _getPixels(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { w: canvas.width, h: canvas.height, data };
}

// ── Polygon generation ───────────────────────────────────────────────────────

/**
 * Generate a Leaflet-compatible polygon approximating an axis-aligned ellipse.
 *
 * @param {number} lat       - Centre latitude
 * @param {number} lng       - Centre longitude
 * @param {number} widthM    - Full east-west extent in metres
 * @param {number} heightM   - Full north-south extent in metres
 * @param {number} [numPts=64]
 * @returns {[number, number][]}  - Array of [lat, lng] coordinates
 */
export function ellipseToPolygon(lat, lng, widthM, heightM, numPts = 64) {
    const latPerM  = 1 / 111320;
    const lngPerM  = 1 / (111320 * Math.cos(lat * Math.PI / 180));
    const semiH    = (heightM / 2) * latPerM;
    const semiW    = (widthM  / 2) * lngPerM;

    const pts = [];
    for (let i = 0; i <= numPts; i++) {
        const angle = (2 * Math.PI * i) / numPts;
        pts.push([lat + semiH * Math.cos(angle), lng + semiW * Math.sin(angle)]);
    }
    return pts;
}
