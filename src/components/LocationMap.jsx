import { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker, Popup, Polyline, Polygon, FeatureGroup, LayersControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// leaflet-draw removed: incompatible with react-leaflet v5
import { rdToWgs84 } from '../utils/apiIntegrations';
import { geoJsonToLeafletPositions, leafletPositionsToGeoJson } from '../utils/traceBuilder';

/**
 * Coordinate resolver — tries all sources in order:
 * 1. loc.lat/lon        (PDOK geocoder, direct)
 * 2. loc.rdX/rdY        (parser output, camelCase)
 * 3. loc.rd_x/rd_y      (DB column names via fetchLocations)
 * 4. loc._enriched.*    (enrichment metadata)
 */
function getLocCoords(loc) {
    let lat = loc.lat ?? loc._enriched?.lat ?? null;
    let lon = loc.lon ?? loc._enriched?.lon ?? null;
    if (!lat || !lon) {
        const rdX = loc.rdX ?? loc.rd_x ?? loc._enriched?.rd?.x ?? null;
        const rdY = loc.rdY ?? loc.rd_y ?? loc._enriched?.rd?.y ?? null;
        if (rdX && rdY) {
            const wgs = rdToWgs84(rdX, rdY);
            if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) { lat = wgs.lat; lon = wgs.lng; }
        }
    }
    lat = parseFloat(lat); lon = parseFloat(lon);
    if (isNaN(lat) || isNaN(lon)) return null;
    return [lat, lon];
}

function FitBounds({ locations, center, radius }) {
    const map = useMap();
    useEffect(() => {
        const validCoords = (locations || []).map(loc => getLocCoords(loc)).filter(Boolean);
        if (validCoords.length > 1) {
            map.fitBounds(L.latLngBounds(validCoords), { padding: [50, 50], maxZoom: 16 });
        } else if (validCoords.length === 1) {
            map.setView(validCoords[0], 15);
        } else if (center && !isNaN(center[0]) && !isNaN(center[1])) {
            const r = parseFloat(radius);
            if (!isNaN(r) && r > 0) {
                const km = r / 1000;
                map.fitBounds(L.latLngBounds(
                    [center[0] - km / 111, center[1] - km / 111],
                    [center[0] + km / 111, center[1] + km / 111]
                ), { padding: [50, 50], maxZoom: 16 });
            } else {
                map.setView(center, 14);
            }
        }
    }, [locations, center, radius, map]);
    return null;
}


// Build a buffer polygon around a polyline.
// Round endcaps + round joins at every vertex for smooth bends.
function buildLineBuffer(points, radiusM) {
    if (!points || points.length < 2) return null;

    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;

    function move([lat, lng], northM, eastM) {
        return [
            lat + toDeg(northM / R),
            lng + toDeg(eastM  / (R * Math.cos(toRad(lat)))),
        ];
    }

    function bearing([lat1, lng1], [lat2, lng2]) {
        const dLng = toRad(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
                - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
        return Math.atan2(y, x);
    }

    // Arc of points around 'center', from angle startA to endA (clockwise if step > 0)
    function arc(center, startA, endA, steps) {
        const pts = [];
        // Normalise sweep direction: always go the short way
        let sweep = endA - startA;
        while (sweep >  Math.PI) sweep -= 2 * Math.PI;
        while (sweep < -Math.PI) sweep += 2 * Math.PI;
        for (let i = 0; i <= steps; i++) {
            const a = startA + (sweep * i) / steps;
            pts.push(move(center, radiusM * Math.cos(a), radiusM * Math.sin(a)));
        }
        return pts;
    }

    const n = points.length;
    const brgs = [];
    for (let i = 0; i < n - 1; i++) brgs.push(bearing(points[i], points[i + 1]));

    // Left offset angle = bearing - 90°, right = bearing + 90°
    const leftAngle  = b => b - Math.PI / 2;
    const rightAngle = b => b + Math.PI / 2;

    const poly = [];

    // ── LEFT side: start → end ──
    // Start endcap left point
    poly.push(move(points[0], radiusM * Math.cos(leftAngle(brgs[0])), radiusM * Math.sin(leftAngle(brgs[0]))));

    for (let i = 1; i < n - 1; i++) {
        const bIn  = brgs[i - 1]; // incoming bearing
        const bOut = brgs[i];     // outgoing bearing
        // Left side: arc from leftAngle(bIn) to leftAngle(bOut) around the joint
        const arcPts = arc(points[i], leftAngle(bIn), leftAngle(bOut), 8);
        poly.push(...arcPts);
    }

    // End point of left side
    poly.push(move(points[n-1], radiusM * Math.cos(leftAngle(brgs[n-2])), radiusM * Math.sin(leftAngle(brgs[n-2]))));

    // ── END endcap: semicircle at last point ──
    // Sweep from leftAngle(lastBrg) → rightAngle(lastBrg) going forward (180°)
    const endArcPts = arc(points[n-1], leftAngle(brgs[n-2]), rightAngle(brgs[n-2]), 18);
    poly.push(...endArcPts);

    // ── RIGHT side: end → start ──
    poly.push(move(points[n-1], radiusM * Math.cos(rightAngle(brgs[n-2])), radiusM * Math.sin(rightAngle(brgs[n-2]))));

    for (let i = n - 2; i > 0; i--) {
        const bIn  = brgs[i];     // was outgoing, now incoming (reversed)
        const bOut = brgs[i - 1]; // was incoming, now outgoing (reversed)
        const arcPts = arc(points[i], rightAngle(bIn), rightAngle(bOut), 8);
        poly.push(...arcPts);
    }

    poly.push(move(points[0], radiusM * Math.cos(rightAngle(brgs[0])), radiusM * Math.sin(rightAngle(brgs[0]))));

    // ── START endcap: semicircle at first point ──
    // Sweep from rightAngle(firstBrg) → leftAngle(firstBrg) going backward (180°)
    const startArcPts = arc(points[0], rightAngle(brgs[0]), leftAngle(brgs[0]), 18);
    poly.push(...startArcPts);

    return poly;
}

export default function LocationMap({
    locations = [],
    height = '400px',
    highlightedLocationCode,
    onLocationClick,
    projectAddress,
    projectTrace,
    traceGeoJson = null,
    onTraceSave = null,
    editMode = false,
}) {
    const [mapCenter, setMapCenter] = useState(null);
    const [bufferRadius, setBufferRadius] = useState(500);
    const [isLoading, setIsLoading] = useState(true);
    const [showMarkers, setShowMarkers] = useState(true);
    const [showContouren, setShowContouren] = useState(true);
    const [showTrace, setShowTrace] = useState(true);
    const featureGroupRef = useRef(null);
    const [drawPoints, setDrawPoints] = useState([]);

    // Save trace when drawPoints change (debounced)
    useEffect(() => {
        if (!editMode) return;
        if (drawPoints.length < 2) return;
        const timer = setTimeout(() => {
            onTraceSave?.(leafletPositionsToGeoJson(drawPoints));
        }, 500);
        return () => clearTimeout(timer);
    }, [drawPoints, editMode]);

    // Expose undo to parent via window (simple approach)
    useEffect(() => {
        window._undoLastTracePoint = () => setDrawPoints(prev => prev.slice(0, -1));
        return () => { delete window._undoLastTracePoint; };
    }, []);

    // When editMode turns on, pre-load saved trace positions so user can edit them
    // When editMode turns off, clear draw points
    useEffect(() => {
        if (editMode && savedTracePositions && savedTracePositions.length > 0) {
            setDrawPoints(savedTracePositions);
        } else if (!editMode) {
            setDrawPoints([]);
        }
    }, [editMode]);

    const locationMarkers = useMemo(() => locations
        .map(loc => { const c = getLocCoords(loc); return c ? { ...loc, _lat: c[0], _lon: c[1] } : null; })
        .filter(Boolean), [locations]);

    const traceLine = useMemo(() => {
        const t = locationMarkers.filter(m => m.afstandTrace != null && !isNaN(parseFloat(m.afstandTrace)));
        if (t.length < 2) return null;
        return [...t].sort((a, b) => parseFloat(a.afstandTrace) - parseFloat(b.afstandTrace)).map(m => [m._lat, m._lon]);
    }, [locationMarkers]);

    const savedTracePositions = useMemo(() => {
        if (!traceGeoJson) return null;
        const positions = geoJsonToLeafletPositions(traceGeoJson);
        return positions.length >= 2 ? positions : null;
    }, [traceGeoJson]);

    // Pre-load existing trace into FeatureGroup when edit mode is activated
    useEffect(() => {
        if (!editMode || !featureGroupRef.current || !savedTracePositions) return;
        featureGroupRef.current.clearLayers();
        const polyline = L.polyline(savedTracePositions, { color: '#f59e0b', weight: 4 });
        featureGroupRef.current.addLayer(polyline);
    }, [editMode, savedTracePositions]);

    useEffect(() => {
        let cancelled = false;
        async function geocode() {
            if (locationMarkers.length > 0) {
                const avgLat = locationMarkers.reduce((s, m) => s + m._lat, 0) / locationMarkers.length;
                const avgLon = locationMarkers.reduce((s, m) => s + m._lon, 0) / locationMarkers.length;
                if (!cancelled) {
                    if (!isNaN(avgLat) && !isNaN(avgLon)) setMapCenter([avgLat, avgLon]);
                    if (projectTrace?.distance) {
                        const r = projectTrace.unit === 'km' ? projectTrace.distance * 1000 : projectTrace.distance;
                        if (!isNaN(r) && r > 0) setBufferRadius(r);
                    }
                    setIsLoading(false);
                }
                return;
            }
            if (!projectAddress) { if (!cancelled) setIsLoading(false); return; }
            try {
                const q = `${projectAddress.straatnaam} ${projectAddress.huisnummer}, ${projectAddress.postcode || projectAddress.city}, Netherlands`;
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}`);
                const results = await res.json();
                if (!cancelled && results.length > 0) {
                    const c = [parseFloat(results[0].lat), parseFloat(results[0].lon)];
                    if (!isNaN(c[0]) && !isNaN(c[1])) setMapCenter(c);
                    if (projectTrace?.distance) {
                        const r = projectTrace.unit === 'km' ? projectTrace.distance * 1000 : projectTrace.distance;
                        if (!isNaN(r) && r > 0) setBufferRadius(r);
                    }
                }
            } catch (e) { console.warn('Geocoding failed:', e); }
            finally { if (!cancelled) setIsLoading(false); }
        }
        geocode();
        return () => { cancelled = true; };
    }, [projectAddress, projectTrace, locationMarkers]);

    const center = mapCenter || [52.0907, 5.1214];
    const hasValidCenter = !!mapCenter;
    const safeRadius = typeof bufferRadius === 'number' && !isNaN(bufferRadius) && bufferRadius > 0 ? bufferRadius : 500;

    if (isLoading) return (
        <div style={{ height, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div><div>Kaart laden...</div></div>
        </div>
    );

    if (!hasValidCenter && locationMarkers.length === 0 && !projectAddress) return (
        <div style={{ height, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div><div>Geen projectlocatie gevonden</div><div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een TOB document met adresgegevens</div></div>
        </div>
    );

    // Custom draw handler: each click adds a waypoint to the trace.
    // Finishing/accepting is done via the button in ProjectDetail.
    function DrawClickHandler() {
        useMapEvents({
            click(e) {
                if (!editMode) return;
                // Prevent propagation issues with map popups
                setDrawPoints(prev => [...prev, [e.latlng.lat, e.latlng.lng]]);
            },
        });
        return null;
    }


    return (
        <div id="master-location-map" style={{ height, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', position: 'relative' }}>
            <MapContainer center={center} zoom={hasValidCenter ? 14 : 8} style={{ height: '100%', width: '100%', cursor: editMode ? 'crosshair' : undefined }} zoomControl={true}>
                <FitBounds locations={locations} center={center} radius={safeRadius} />

                {/* ── Tile base layers + WMS overlays via LayersControl ── */}
                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <DrawClickHandler />
                <TileLayer attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="PDOK Luchtfoto">
                        <TileLayer attribution='&copy; PDOK' url="https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg" maxZoom={19} />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="PDOK BRT Achtergrond">
                        <TileLayer attribution='&copy; Kadaster / PDOK' url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png" maxZoom={19} />
                    </LayersControl.BaseLayer>
                    <LayersControl.Overlay name="Bodemkwaliteitskaart">
                        <WMSTileLayer url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0" layers="bodemkwaliteitskaart" format="image/png" transparent={true} opacity={0.5} attribution='&copy; PDOK Bodemkwaliteit' />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay checked name="Kadastrale Percelen (BRK)">
                        <WMSTileLayer url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0" layers="Perceel" format="image/png" transparent={true} opacity={0.6} attribution='&copy; Kadaster' />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay name="Gebouwcontouren (BAG)">
                        <WMSTileLayer url="https://service.pdok.nl/lvbag/bag/wms/v2_0" layers="pand" format="image/png" transparent={true} opacity={0.6} attribution='&copy; BAG' />
                    </LayersControl.Overlay>
                </LayersControl>

                {/* ── Vector overlays — rendered directly in MapContainer (not in LayersControl) ── */}

                {/* Project buffer circle */}
                {hasValidCenter && safeRadius !== 500 && (
                    <Circle center={mapCenter} radius={safeRadius} pathOptions={{ color: '#1976d2', weight: 3, opacity: 0.6, fillColor: '#1976d2', fillOpacity: 0.1, dashArray: '5, 5' }} />
                )}

                {/* Tracé lijn — saved GeoJSON takes precedence over afstand_trace fallback */}
                {showTrace && savedTracePositions && (
                    <Polyline positions={savedTracePositions} pathOptions={{ color: '#f59e0b', weight: 4, opacity: 0.9 }} />
                )}
                {/* Buffer polygon: 25m around saved trace line */}
                {showTrace && savedTracePositions && savedTracePositions.length > 1 && (() => {
                    const buf = buildLineBuffer(savedTracePositions, 25);
                    return buf ? <Polygon positions={buf} pathOptions={{ color: '#f59e0b', weight: 1.5, opacity: 0.5, fillColor: '#f59e0b', fillOpacity: 0.1, dashArray: '6 4' }} /> : null;
                })()}
                {showTrace && !savedTracePositions && traceLine && (
                    <Polyline positions={traceLine} pathOptions={{ color: '#f59e0b', weight: 3, opacity: 0.85, dashArray: '10, 6' }} />
                )}

                {/* Leaflet-draw: edit/draw tracé */}
                {editMode && (
                    <FeatureGroup>
                        {drawPoints.length > 1 && (
                            <Polyline
                                positions={drawPoints}
                                pathOptions={{ color: '#f59e0b', weight: 4 }}
                            />
                        )}
                        {/* Buffer polygon: 25m around drawn trace line */}
                        {drawPoints.length > 1 && (() => {
                            const buf = buildLineBuffer(drawPoints, 25);
                            return buf ? <Polygon positions={buf} pathOptions={{ color: '#f59e0b', weight: 1.5, opacity: 0.6, fillColor: '#f59e0b', fillOpacity: 0.12, dashArray: '6 4' }} /> : null;
                        })()}
                        {drawPoints.map((pt, i) => (
                            <CircleMarker
                                key={i}
                                center={pt}
                                radius={5}
                                pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 1 }}
                            />
                        ))}
                    </FeatureGroup>
                )}

                {/* Contour circles */}
                {showContouren && locationMarkers.map(loc => {
                    const isComplex = loc.complex || loc.isComplex;
                    const color = isComplex ? '#ef4444' : '#3b82f6';
                    const radius = loc.straalRadius || 25;
                    return (
                        <Circle key={`contour-${loc.locatiecode}`} center={[loc._lat, loc._lon]} radius={radius}
                            pathOptions={{ color, weight: 2, opacity: 0.7, fillColor: color, fillOpacity: 0.06, dashArray: '6, 4' }}>
                            <Popup><div style={{ fontSize: '11px' }}><strong>{loc.locatiecode}</strong><br />Onderzoeksgebied: {radius}m straal</div></Popup>
                        </Circle>
                    );
                })}

                {/* Location markers */}
                {showMarkers && locationMarkers.map(loc => {
                    const isHighlighted = highlightedLocationCode === loc.locatiecode;
                    const isComplex = loc.complex || loc.isComplex;
                    const color = isComplex ? '#ef4444' : '#22c55e';
                    const nazcaDetail = loc._nazcaDetail || loc._enriched?.nazcaDetail || loc.enriched_data?.nazcaDetail;
                    return (
                        <CircleMarker key={loc.locatiecode} center={[loc._lat, loc._lon]}
                            radius={isHighlighted ? 10 : 7}
                            pathOptions={{ color: isHighlighted ? '#fff' : color, weight: isHighlighted ? 3 : 2, fillColor: color, fillOpacity: 0.8 }}
                            eventHandlers={{ click: () => onLocationClick?.(loc) }}>
                            <Popup>
                                <div style={{ fontSize: '12px', minWidth: '180px' }}>
                                    <strong>{loc.locatiecode}</strong>
                                    {loc.locatienaam && <div style={{ color: '#555' }}>{loc.locatienaam}</div>}
                                    {loc.straatnaam && <div>{loc.straatnaam} {loc.huisnummer}</div>}
                                    {loc.woonplaats && <div>{loc.postcode} {loc.woonplaats}</div>}
                                    {nazcaDetail?.beoordeling && (
                                        <div style={{ marginTop: '4px', padding: '3px 6px', background: isComplex ? '#fef2f2' : '#f0fdf4', borderRadius: '4px', fontSize: '11px' }}>
                                            <strong>Nazca:</strong> {nazcaDetail.beoordeling}
                                        </div>
                                    )}
                                    {nazcaDetail?.vervolgactie && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Vervolgactie: {nazcaDetail.vervolgactie}</div>}
                                    {nazcaDetail?.rapporten?.length > 0 && <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>📄 {nazcaDetail.rapporten.length} onderzoeksrapport(en)</div>}
                                    {loc.conclusie && <div style={{ marginTop: '4px', color: isComplex ? '#ef4444' : '#22c55e', fontWeight: 500 }}>{loc.conclusie}</div>}
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>

            {/* ── Custom legend + layer toggles ── */}
            <div style={{ position: 'absolute', bottom: '8px', left: '8px', zIndex: 1000, background: 'rgba(0,0,0,0.85)', color: 'white', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', maxWidth: '220px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>📍 {locationMarkers.length} locatie(s)</div>
                {projectTrace && (
                    <div style={{ marginBottom: '6px', fontSize: '11px', borderBottom: '1px solid #555', paddingBottom: '6px' }}>
                        <div style={{ color: '#4da6ff' }}>Auto-gedetecteerd</div>
                        <div><strong>Tracé:</strong> {projectTrace.description}</div>
                        {projectTrace.distance && <div>Buffer: {projectTrace.distance} {projectTrace.unit}</div>}
                    </div>
                )}
                {/* Layer toggles */}
                <div style={{ fontSize: '11px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input type="checkbox" checked={showMarkers} onChange={e => setShowMarkers(e.target.checked)} style={{ cursor: 'pointer' }} />
                        <span style={{ color: '#22c55e' }}>●</span> Markers
                    </label>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input type="checkbox" checked={showContouren} onChange={e => setShowContouren(e.target.checked)} style={{ cursor: 'pointer' }} />
                        <span style={{ color: '#3b82f6' }}>○</span> Contouren (straal)
                    </label>
                    {(savedTracePositions || traceLine) && (
                        <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <input type="checkbox" checked={showTrace} onChange={e => setShowTrace(e.target.checked)} style={{ cursor: 'pointer' }} />
                            <span style={{ color: '#f59e0b' }}>─</span> Tracé{savedTracePositions ? ' (opgeslagen)' : ''}
                        </label>
                    )}
                </div>
                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '5px' }}>
                    <span style={{ color: '#22c55e' }}>●</span> Onverdacht &nbsp;
                    <span style={{ color: '#ef4444' }}>●</span> Verdacht
                </div>
            </div>
        </div>
    );
}
