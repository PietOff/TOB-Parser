/**
 * traceBuilder.js — Utilities for building, converting, and persisting tracé geometry
 *
 * buildTraceGeoJson   — combines location coords + OCR RD coords into a GeoJSON LineString
 * geoJsonToLeafletPositions — [lng, lat] → [lat, lng] for Leaflet
 * leafletPositionsToGeoJson — [lat, lng] → GeoJSON LineString Feature
 */
import { rdToWgs84 } from './apiIntegrations';

const DEDUP_THRESHOLD_DEG = 0.0005; // ~50 m at Dutch latitudes

/**
 * Build a GeoJSON LineString Feature from location objects and optional OCR-found RD coords.
 *
 * @param {Array} locations     - Location objects from dbRowToLocation (have rd_x/rd_y or lat/lon)
 * @param {Array} ocrRdCoords   - [{ x, y }] RD coordinate pairs found via OCR (may be empty)
 * @returns {Object|null}       - GeoJSON Feature (LineString) or null if fewer than 2 valid points
 */
export function buildTraceGeoJson(locations, ocrRdCoords = []) {
    // ── Step 1: Collect location waypoints ───────────────────────────────────
    const locPoints = [];
    for (const loc of locations) {
        let lat = loc.lat ?? loc._enriched?.lat ?? null;
        let lon = loc.lon ?? loc._enriched?.lon ?? null;

        if (!lat || !lon) {
            const rdX = loc.rdX ?? loc.rd_x ?? loc._enriched?.rd?.x ?? null;
            const rdY = loc.rdY ?? loc.rd_y ?? loc._enriched?.rd?.y ?? null;
            if (rdX && rdY) {
                const wgs = rdToWgs84(rdX, rdY);
                if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) {
                    lat = wgs.lat;
                    lon = wgs.lng;
                }
            }
        }

        lat = parseFloat(lat);
        lon = parseFloat(lon);
        if (isNaN(lat) || isNaN(lon)) continue;

        const afstand = parseFloat(loc.afstandTrace ?? loc.afstand_trace ?? NaN);
        locPoints.push({ lat, lon, source: 'location', afstand: isNaN(afstand) ? null : afstand });
    }

    // Sort location points: prefer afstand_trace ordering, fall back to locatiecode order
    const hasAfstand = locPoints.some(p => p.afstand !== null);
    if (hasAfstand) {
        locPoints.sort((a, b) => {
            if (a.afstand !== null && b.afstand !== null) return a.afstand - b.afstand;
            if (a.afstand !== null) return -1;
            if (b.afstand !== null) return 1;
            return 0;
        });
    }

    // ── Step 2: Collect OCR waypoints ────────────────────────────────────────
    const ocrPoints = [];
    for (const { x, y } of ocrRdCoords) {
        const wgs = rdToWgs84(x, y);
        if (!wgs || isNaN(wgs.lat) || isNaN(wgs.lng)) continue;
        ocrPoints.push({ lat: wgs.lat, lon: wgs.lng, source: 'ocr', afstand: null });
    }

    // ── Step 3: Merge + deduplicate ──────────────────────────────────────────
    const allPoints = [...locPoints];
    for (const op of ocrPoints) {
        const tooClose = allPoints.some(
            p => Math.abs(p.lat - op.lat) < DEDUP_THRESHOLD_DEG &&
                 Math.abs(p.lon - op.lon) < DEDUP_THRESHOLD_DEG
        );
        if (!tooClose) allPoints.push(op);
    }

    if (allPoints.length < 2) return null;

    // ── Step 4: Sort OCR points into the sequence ────────────────────────────
    // If we have location anchors with afstand, assign virtual afstand to OCR points
    // by projecting them between their two nearest location anchors
    if (hasAfstand && ocrPoints.length > 0) {
        const anchors = allPoints.filter(p => p.source === 'location' && p.afstand !== null);
        for (const op of allPoints.filter(p => p.source === 'ocr')) {
            if (anchors.length < 2) { op.afstand = 0; continue; }
            // Find nearest anchor
            let minDist = Infinity;
            let nearestIdx = 0;
            for (let i = 0; i < anchors.length; i++) {
                const d = Math.hypot(anchors[i].lat - op.lat, anchors[i].lon - op.lon);
                if (d < minDist) { minDist = d; nearestIdx = i; }
            }
            // Assign afstand midway between this anchor and the next one
            const prev = anchors[nearestIdx];
            const next = anchors[Math.min(nearestIdx + 1, anchors.length - 1)];
            op.afstand = (prev.afstand + next.afstand) / 2;
        }
        allPoints.sort((a, b) => {
            if (a.afstand !== null && b.afstand !== null) return a.afstand - b.afstand;
            return 0;
        });
    }

    // ── Step 5: Build GeoJSON ─────────────────────────────────────────────────
    const coordinates = allPoints.map(p => [p.lon, p.lat]); // GeoJSON: [lng, lat]

    return {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates,
        },
        properties: {
            source: ocrPoints.length > 0 ? 'auto+ocr' : 'auto',
            pointCount: allPoints.length,
            generatedAt: new Date().toISOString(),
        },
    };
}

/**
 * Convert a GeoJSON LineString Feature to Leaflet [lat, lng] positions.
 * GeoJSON uses [lng, lat]; Leaflet uses [lat, lng].
 */
export function geoJsonToLeafletPositions(feature) {
    if (!feature?.geometry?.coordinates) return [];
    return feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

/**
 * Convert an array of Leaflet [lat, lng] positions to a GeoJSON LineString Feature.
 */
export function leafletPositionsToGeoJson(latLngArray, metadata = {}) {
    return {
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: latLngArray.map(([lat, lng]) => [lng, lat]),
        },
        properties: {
            source: 'manual',
            pointCount: latLngArray.length,
            savedAt: new Date().toISOString(),
            ...metadata,
        },
    };
}
