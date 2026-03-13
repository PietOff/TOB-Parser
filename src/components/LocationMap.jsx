import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, WMSTileLayer, Circle, CircleMarker, Popup, Polyline, FeatureGroup, LayersControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { rdToWgs84 } from '../utils/apiIntegrations';

/**
 * Unified coordinate resolver — tries all possible coordinate sources in order:
 * 1. loc.lat/lon   (written directly by PDOK geocodeLocations)
 * 2. loc.rdX/rdY   (RD coordinates written directly by parsers/geocoder)
 * 3. loc._enriched?.lat/lon
 * 4. loc._enriched?.rd.x/y  (fallback via enrichLocation)
 */
function getLocCoords(loc) {
    let lat = loc.lat ?? loc._enriched?.lat ?? null;
    let lon = loc.lon ?? loc._enriched?.lon ?? null;
    if (!lat || !lon) {
        const rdX = loc.rdX ?? loc._enriched?.rd?.x ?? null;
        const rdY = loc.rdY ?? loc._enriched?.rd?.y ?? null;
        if (rdX && rdY) {
            const wgs = rdToWgs84(rdX, rdY);
            if (wgs && !isNaN(wgs.lat) && !isNaN(wgs.lng)) { lat = wgs.lat; lon = wgs.lng; }
        }
    }
    lat = parseFloat(lat); lon = parseFloat(lon);
    if (isNaN(lat) || isNaN(lon)) return null;
    return [lat, lon];
}

// Component to auto-fit map bounds to all locations
function FitBounds({ locations, center, radius }) {
    const map = useMap();
    useEffect(() => {
        const validCoords = (locations || [])
            .map(loc => getLocCoords(loc))
            .filter(Boolean);

        if (validCoords.length > 1) {
            const bounds = L.latLngBounds(validCoords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } else if (validCoords.length === 1) {
            map.setView(validCoords[0], 15);
        } else if (center && Array.isArray(center) && !isNaN(center[0]) && !isNaN(center[1])) {
            const parsedRadius = parseFloat(radius);
            if (!isNaN(parsedRadius) && parsedRadius > 0) {
                const radiusKm = parsedRadius / 1000;
                const bounds = L.latLngBounds(
                    [center[0] - radiusKm / 111, center[1] - radiusKm / 111],
                    [center[0] + radiusKm / 111, center[1] + radiusKm / 111]
                );
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
            } else {
                map.setView(center, 14);
            }
        }
    }, [locations, center, radius, map]);
    return null;
}

/**
 * LocationMap — Interactive map showing project trace area and location markers
 */
export default function LocationMap({
    locations = [],
    height = '400px',
    highlightedLocationCode,
    projectAddress,
    projectTrace
}) {
    const [mapCenter, setMapCenter] = useState(null);
    const [bufferRadius, setBufferRadius] = useState(500);
    const [isLoading, setIsLoading] = useState(true);

    // Compute location markers with WGS84 coordinates
    const locationMarkers = useMemo(() => {
        return locations
            .map(loc => {
                const coords = getLocCoords(loc);
                if (!coords) return null;
                return { ...loc, _lat: coords[0], _lon: coords[1] };
            })
            .filter(Boolean);
    }, [locations]);

    // Geocode the project address to get map center
    useEffect(() => {
        let cancelled = false;

        async function geocodeAddress() {
            if (locationMarkers.length > 0) {
                const avgLat = locationMarkers.reduce((s, m) => s + m._lat, 0) / locationMarkers.length;
                const avgLon = locationMarkers.reduce((s, m) => s + m._lon, 0) / locationMarkers.length;
                if (!cancelled) {
                    if (!isNaN(avgLat) && !isNaN(avgLon)) {
                        setMapCenter([avgLat, avgLon]);
                    }
                    if (projectTrace?.distance) {
                        const radiusM = projectTrace.unit === 'km'
                            ? projectTrace.distance * 1000
                            : projectTrace.distance;
                        if (!isNaN(radiusM) && radiusM > 0) setBufferRadius(radiusM);
                    }
                    setIsLoading(false);
                }
                return;
            }

            if (!projectAddress) {
                if (!cancelled) setIsLoading(false);
                return;
            }

            try {
                const query = `${projectAddress.straatnaam} ${projectAddress.huisnummer}, ${projectAddress.postcode || projectAddress.city}, Netherlands`;
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
                );
                const results = await response.json();

                if (!cancelled && results.length > 0) {
                    const first = results[0];
                    const c = [parseFloat(first.lat), parseFloat(first.lon)];
                    if (!isNaN(c[0]) && !isNaN(c[1])) setMapCenter(c);

                    if (projectTrace?.distance) {
                        const radiusM = projectTrace.unit === 'km'
                            ? projectTrace.distance * 1000
                            : projectTrace.distance;
                        if (!isNaN(radiusM) && radiusM > 0) setBufferRadius(radiusM);
                    }
                }
            } catch (err) {
                console.warn('Geocoding failed:', err);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        geocodeAddress();
        return () => { cancelled = true; };
    }, [projectAddress, projectTrace, locationMarkers]);

    const defaultCenter = [52.0907, 5.1214];
    const center = mapCenter || defaultCenter;
    const hasValidCenter = !!mapCenter;

    if (isLoading) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Kaart laden...</div>
                </div>
            </div>
        );
    }

    if (!hasValidCenter && locationMarkers.length === 0 && !projectAddress) {
        return (
            <div style={{
                height,
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.875rem',
                border: '1px dashed var(--border)',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗺️</div>
                    <div>Geen projectlocatie gevonden</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>Upload een TOB document met adresgegevens</div>
                </div>
            </div>
        );
    }

    const safeBufferRadius = (typeof bufferRadius === 'number' && !isNaN(bufferRadius) && bufferRadius > 0)
        ? bufferRadius : 500;

    return (
        <div id="master-location-map" style={{
            height,
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            position: 'relative',
        }}>
            <MapContainer
                center={center}
                zoom={!hasValidCenter ? 8 : 14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <FitBounds locations={locations} center={center} radius={safeBufferRadius} />

                <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="OpenStreetMap">
                        <TileLayer
                            attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK Luchtfoto">
                        <TileLayer
                            attribution='&copy; PDOK'
                            url="https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.BaseLayer name="PDOK BRT Achtergrond">
                        <TileLayer
                            attribution='&copy; Kadaster / PDOK'
                            url="https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"
                            maxZoom={19}
                        />
                    </LayersControl.BaseLayer>

                    <LayersControl.Overlay name="Bodemkwaliteitskaart">
                        <WMSTileLayer
                            url="https://service.pdok.nl/provincies/bodemkwaliteit/wms/v1_0"
                            layers="bodemkwaliteitskaart"
                            format="image/png"
                            transparent={true}
                            opacity={0.5}
                            attribution='&copy; PDOK Bodemkwaliteit'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay checked name="Kadastrale Percelen (BRK)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/kadaster/kadastralekaart/wms/v5_0"
                            layers="Perceel"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; Kadaster'
                        />
                    </LayersControl.Overlay>

                    <LayersControl.Overlay name="Gebouwcontouren (BAG)">
                        <WMSTileLayer
                            url="https://service.pdok.nl/lvbag/bag/wms/v2_0"
                            layers="pand"
                            format="image/png"
                            transparent={true}
                            opacity={0.6}
                            attribution='&copy; BAG'
                        />
                    </LayersControl.Overlay>
                </LayersControl>

                {/* Project area buffer circle — only when a real trace distance was detected */}
                {hasValidCenter && safeBufferRadius !== 500 && (
                    <Circle
                        center={mapCenter}
                        radius={safeBufferRadius}
                        pathOptions={{
                            color: '#1976d2',
                            weight: 3,
                            opacity: 0.6,
                            fillColor: '#1976d2',
                            fillOpacity: 0.1,
                            dashArray: '5, 5',
                        }}
                    />
                )}

                {/* Trace polyline — connect markers with afstandTrace, sorted by distance */}
                {(() => {
                    const traceMarkers = locationMarkers.filter(m => m.afstandTrace != null && !isNaN(parseFloat(m.afstandTrace)));
                    const sorted = [...traceMarkers].sort((a, b) => parseFloat(a.afstandTrace) - parseFloat(b.afstandTrace));
                    if (sorted.length < 2) return null;
                    return (
                        <LayersControl.Overlay checked name="Tracé lijn">
                            <FeatureGroup>
                                <Polyline
                                    positions={sorted.map(m => [m._lat, m._lon])}
                                    pathOptions={{
                                        color: '#f59e0b',
                                        weight: 3,
                                        opacity: 0.85,
                                        dashArray: '10, 6',
                                    }}
                                />
                            </FeatureGroup>
                        </LayersControl.Overlay>
                    );
                })()}

                {/* Per-location 25m contour circles (onderzoeksgebied) */}
                {locationMarkers.length > 0 && (
                    <LayersControl.Overlay checked name="Onderzoeksgebied contouren (25m)">
                        <FeatureGroup>
                            {locationMarkers.map(loc => {
                                const isComplex = loc.complex || loc.isComplex;
                                const color = isComplex ? '#ef4444' : '#3b82f6';
                                return (
                                    <Circle
                                        key={`contour-${loc.locatiecode}`}
                                        center={[loc._lat, loc._lon]}
                                        radius={25}
                                        pathOptions={{
                                            color,
                                            weight: 2,
                                            opacity: 0.7,
                                            fillColor: color,
                                            fillOpacity: 0.06,
                                            dashArray: '6, 4',
                                        }}
                                    />
                                );
                            })}
                        </FeatureGroup>
                    </LayersControl.Overlay>
                )}

                {/* Individual location markers */}
                <LayersControl.Overlay checked name="Locatiemarkers">
                    <FeatureGroup>
                        {locationMarkers.map(loc => {
                            const isHighlighted = highlightedLocationCode === loc.locatiecode;
                            const isComplex = loc.complex || loc.isComplex;
                            const color = isComplex ? '#ef4444' : '#22c55e';
                            const nazcaDetail = loc._nazcaDetail || loc._enriched?.nazcaDetail;

                            return (
                                <CircleMarker
                                    key={loc.locatiecode}
                                    center={[loc._lat, loc._lon]}
                                    radius={isHighlighted ? 10 : 7}
                                    pathOptions={{
                                        color: isHighlighted ? '#fff' : color,
                                        weight: isHighlighted ? 3 : 2,
                                        fillColor: color,
                                        fillOpacity: 0.8,
                                    }}
                                >
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
                                            {nazcaDetail?.vervolgactie && (
                                                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                                    Vervolgactie: {nazcaDetail.vervolgactie}
                                                </div>
                                            )}
                                            {nazcaDetail?.rapporten?.length > 0 && (
                                                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                                                    📄 {nazcaDetail.rapporten.length} onderzoeksrapport(en)
                                                </div>
                                            )}
                                            {loc.conclusie && (
                                                <div style={{ marginTop: '4px', color: isComplex ? '#ef4444' : '#22c55e', fontWeight: 500 }}>
                                                    {loc.conclusie}
                                                </div>
                                            )}
                                        </div>
                                    </Popup>
                                </CircleMarker>
                            );
                        })}
                    </FeatureGroup>
                </LayersControl.Overlay>
            </MapContainer>

            {/* Map legend and info overlay */}
            <div style={{
                position: 'absolute',
                bottom: '8px',
                left: '8px',
                zIndex: 1000,
                background: 'rgba(0,0,0,0.85)',
                color: 'white',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                maxWidth: '300px',
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    📍 {locationMarkers.length} locatie(s) op kaart
                </div>
                {projectAddress && (
                    <div style={{ marginBottom: '6px', fontSize: '11px' }}>
                        <div><strong>{projectAddress.straatnaam} {projectAddress.huisnummer}</strong></div>
                        <div>{projectAddress.postcode} {projectAddress.city}</div>
                    </div>
                )}
                {projectTrace && (
                    <div style={{ marginBottom: '6px', fontSize: '11px', borderTop: '1px solid #555', paddingTop: '6px' }}>
                        <div style={{ color: '#4da6ff' }}>Auto-gedetecteerd</div>
                        <div><strong>Tracé:</strong> {projectTrace.description}</div>
                        {projectTrace.distance && (
                            <div>Buffer: {projectTrace.distance} {projectTrace.unit}</div>
                        )}
                    </div>
                )}
                <div style={{ fontSize: '10px', opacity: 0.8, borderTop: '1px solid #555', paddingTop: '6px', marginTop: '6px' }}>
                    <span style={{ color: '#22c55e' }}>●</span> Onverdacht &nbsp;
                    <span style={{ color: '#ef4444' }}>●</span> Complex/Verdacht<br />
                    <span style={{ color: '#3b82f6' }}>○</span> Contour 25m &nbsp;
                    <span style={{ color: '#f59e0b' }}>─ ─</span> Tracé
                </div>
            </div>
        </div>
    );
}
